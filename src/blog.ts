import { marked } from "marked";
import DOMPurify from "dompurify";
import { assetUrl } from "./asset-url";
import { posts } from "./posts";
import { queryPosts, type Post } from "./blog-content";
import { escapeHtml as esc } from "./html";
import "./blog.css";

const siteTitle = "RHINE JOURNAL · 莱茵手记";
const href = (post: Post) => `#/post/${post.slug}`;
function stored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function persist(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Reading works without storage. */
  }
}

interface BlogHost {
  article(
    index: number,
    destination: () => DOMRect | undefined,
    onRetreat: () => void,
  ): Promise<boolean>;
  skipArticle(): void;
  home(): Promise<void>;
  replay(): void;
  theme(): void;
  reduced(): boolean;
}

/** The blog lives outside the scaled 1920px scene so text uses real CSS pixels. */
export class BlogApp {
  root = document.createElement("section");
  private returnButton = document.createElement("button");
  private routeExits: Animation[] = [];
  private entrance: Animation[] = [];
  private enabled = false;
  private booting = true;
  private lastList = "#/";
  private current?: Post;
  private saved = new Set<string>();
  private positions = new Map<string, number>();
  private focused = stored<boolean>("rhine-blog-focus", false) === true;
  private fontSize = Math.min(
    22,
    Math.max(16, Number(stored("rhine-blog-font", 18)) || 18),
  );
  private observer?: IntersectionObserver;
  private scrollTimer?: ReturnType<typeof setTimeout>;
  private routeVersion = 0;
  private sceneUnavailable = false;
  private extracting = false;
  private retreating = false;
  openArticle(index: number) {
    const post = posts[index];
    if (!post) return;
    if (location.hash === "#/experience") this.lastList = "#/experience";
    location.hash = href(post);
  }
  get savedCount() {
    return this.saved.size;
  }
  openSaved() {
    location.hash = "#/?saved=1";
  }

  constructor(private host: BlogHost) {
    document.body.classList.add("blog-app");
    const saved = stored<unknown>("rhine-blog-saved", []);
    if (Array.isArray(saved))
      this.saved = new Set(
        saved.filter((value): value is string => typeof value === "string"),
      );
    this.root.id = "blog";
    this.root.hidden = true;
    this.root.setAttribute("aria-label", "莱茵手记");
    document.body.append(this.root);
    this.returnButton.className = "blog-home";
    this.returnButton.type = "button";
    this.returnButton.setAttribute("aria-label", "返回博客");
    this.returnButton.textContent = "BLOG HOME ↗";
    this.returnButton.addEventListener("click", () => (location.hash = "#/"));
    this.returnButton.hidden = true;
    document
      .querySelector('.system-nav [data-action="search"]')!
      .after(this.returnButton);
    window.addEventListener("hashchange", () => {
      if (this.enabled) this.route();
    });
    const mobile = matchMedia("(max-width: 700px)");
    mobile.addEventListener("change", () => {
      const toc = this.root.querySelector<HTMLDetailsElement>(".blog-toc");
      if (toc) toc.open = !mobile.matches;
      this.progress();
    });
    this.root.addEventListener("click", (event) => this.click(event));
    this.root.addEventListener("input", (event) => {
      if ((event.target as HTMLElement).id === "blog-query")
        this.filterChanged();
    });
    this.root.addEventListener("change", (event) => {
      if ((event.target as HTMLElement).matches("[data-blog-filter]"))
        this.filterChanged();
    });
    document.addEventListener("keydown", (event) => {
      if (!this.visible) return;
      // Arrow keys, space, and Enter belong to native reading controls here.
      const typing = (event.target as HTMLElement).matches(
        "input,textarea,select,[contenteditable]",
      );
      if (event.key === "/" && !typing) {
        event.preventDefault();
        this.search();
      }
      if (event.key === "Escape" && this.current && !typing)
        location.hash = this.lastList;
    });
  }

  get visible() {
    return this.enabled && !this.root.hidden;
  }
  withoutScene() {
    this.sceneUnavailable = true;
    if (location.hash === "#/experience") history.replaceState(null, "", "#/");
    this.syncMode("archive");
  }
  syncMode(mode: string) {
    const wasBooting = this.booting;
    this.booting = mode === "boot";
    this.root.classList.toggle("blog-reduced", this.host.reduced());
    if (this.booting) {
      ++this.routeVersion;
      this.routeExits.forEach((animation) => animation.cancel());
      this.entrance.forEach((animation) => animation.cancel());
      this.routeExits = [];
      this.entrance = [];
      this.root.inert = false;
      this.root.hidden = true;
      this.returnButton.hidden = true;
      document.body.classList.remove("blog-visible", "blog-extracting");
      document.querySelector<HTMLElement>("#stage")!.inert = false;
      return;
    }
    if (!this.enabled) {
      this.enabled = true;
      this.route();
    } else if (wasBooting) this.route();
    else this.visibility();
  }

  private visibility() {
    const experience = location.hash === "#/experience";
    this.root.hidden = this.booting || experience;
    this.returnButton.hidden = this.booting || !experience;
    document.body.classList.toggle("blog-visible", !this.root.hidden);
    this.root.classList.toggle("is-extracting", this.extracting);
    this.root.classList.toggle("is-paper-retreating", this.retreating);
    document.body.classList.toggle(
      "blog-extracting",
      (this.extracting || this.retreating) && !this.root.hidden,
    );
    this.root
      .querySelector<HTMLElement>(".blog-scroll")
      ?.toggleAttribute("inert", this.extracting);
    document.querySelector<HTMLElement>("#three-scene")!.inert = !experience;
    // Exclude covered original controls from the tab order and accessibility tree.
    document
      .querySelectorAll<HTMLElement>(
        "#archive-ui,#detail-ui,.system-nav,.system-footer,.brand,.powered",
      )
      .forEach((node) => {
        if (!experience) node.inert = true;
      });
  }

  private async route() {
    const version = ++this.routeVersion;
    const fromExperience =
      this.root.hidden && this.root.dataset.route === "#/experience";
    const exitNodes = !this.root.hidden
      ? [this.root]
      : fromExperience
        ? [
            ...document.querySelectorAll<HTMLElement>(
              "#archive-ui,.system-nav,.system-footer",
            ),
          ]
        : [];
    const opacities = exitNodes.map((node) => getComputedStyle(node).opacity);
    this.routeExits.forEach((animation) => animation.cancel());
    this.entrance.forEach((animation) => animation.cancel());
    this.entrance = [];
    const samePage =
      this.root.dataset.route?.split("?")[0] ===
      (location.hash || "#/").split("?")[0];
    if (
      exitNodes.length &&
      this.root.dataset.route &&
      !samePage &&
      !this.host.reduced()
    ) {
      this.root.inert = true;
      this.routeExits = exitNodes.map((node, i) =>
        node.animate([{ opacity: opacities[i] }, { opacity: 0 }], {
          duration: 180,
          easing: "ease-in",
          fill: "forwards",
        }),
      );
      await Promise.all(
        this.routeExits.map((animation) => animation.finished.catch(() => {})),
      );
      if (version !== this.routeVersion) return;
      this.routeExits.forEach((animation) => animation.cancel());
      this.routeExits = [];
    }
    this.root.inert = false;
    const oldScroll = this.root.querySelector<HTMLElement>(".blog-scroll");
    if (oldScroll && !this.extracting)
      this.positions.set(this.root.dataset.route ?? "#/", oldScroll.scrollTop);
    this.observer?.disconnect();
    clearTimeout(this.scrollTimer);
    this.extracting = false;
    this.retreating = false;
    if (this.sceneUnavailable && location.hash === "#/experience")
      history.replaceState(null, "", "#/");
    const hash = location.hash || "#/";
    this.root.dataset.route = hash;
    this.current = undefined;
    this.visibility();
    if (hash === "#/experience") {
      document.title = "RHINE JOURNAL · 三维书架";
      await this.host.home();
      if (version !== this.routeVersion) return;
      this.animateEntrance(
        document.querySelectorAll<HTMLElement>(
          "#archive-ui,.system-nav,.system-footer",
        ),
      );
      document
        .querySelectorAll<HTMLElement>(".brand,.powered")
        .forEach((node) => (node.inert = false));
      this.returnButton.focus();
      return;
    }
    const [path, query = ""] = hash.slice(1).split("?");
    if (path === "/" || path === "") {
      this.lastList = hash;
      this.host.home();
      this.renderList(new URLSearchParams(query));
      document.title = siteTitle;
      this.description("关于技术、设计与日常观察的个人博客。");
    } else if (path.startsWith("/post/")) {
      const post = posts.find((item) => `/post/${item.slug}` === path);
      if (post) {
        this.current = post;
        this.extracting = !this.sceneUnavailable && !this.host.reduced();
        this.renderExtraction();
        let revealed = false;
        const reveal = (retreating: boolean) => {
          if (version !== this.routeVersion || revealed) return;
          revealed = true;
          this.extracting = false;
          this.retreating = retreating;
          this.renderArticle(post);
          this.bindReadingScroll();
          this.visibility();
          this.progress();
          this.animateEntrance(
            this.root.querySelectorAll<HTMLElement>(
              ".blog-article-header,.blog-prose,.blog-reading-aside,.blog-reading-progress",
            ),
          );
          this.root
            .querySelector<HTMLElement>("h1")
            ?.focus({ preventScroll: true });
        };
        const opening = this.host.article(
          posts.indexOf(post),
          () =>
            (
              this.root.querySelector("[data-document-destination]") ??
              this.root.querySelector(".blog-article")
            )?.getBoundingClientRect(),
          () => reveal(true),
        );
        if (this.extracting)
          this.root.insertAdjacentHTML(
            "beforeend",
            `<button class="blog-extraction-skip" data-blog="skip-article" aria-label="跳过打开动画">skip <span aria-hidden="true">▶▶</span></button>`,
          );
        void opening
          .then(() => {
            if (version !== this.routeVersion) return;
            reveal(false);
            this.retreating = false;
            this.visibility();
          })
          .catch((error) => {
            console.error(error);
            if (version !== this.routeVersion) return;
            reveal(false);
            this.retreating = false;
            this.visibility();
          });
        document.title = `${post.title} · 莱茵手记`;
        this.description(post.description);
      } else this.notFound();
    } else this.notFound();
    this.visibility();
    this.root.classList.toggle("is-reading", !!this.current);
    this.root.classList.toggle("is-focused", this.focused);
    this.root.style.setProperty("--reading-size", `${this.fontSize}px`);
    if (fromExperience && !this.host.reduced())
      this.entrance.push(
        this.root.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 320,
          easing: "ease-out",
        }),
      );
    if (!this.host.reduced() && !this.extracting)
      this.root.querySelector(".blog-scroll")?.animate(
        [
          { opacity: 0, transform: "translateY(10px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 320, easing: "ease-out" },
      );
    const scroll = this.root.querySelector<HTMLElement>(".blog-scroll");
    const restore = this.positions.get(hash) ?? 0;
    requestAnimationFrame(() => {
      if (version !== this.routeVersion) return;
      if (scroll) scroll.scrollTop = restore;
      this.root
        .querySelector<HTMLElement>("h1")
        ?.focus({ preventScroll: true });
      this.progress();
    });
    scroll?.addEventListener(
      "scroll",
      () => {
        if (!this.current) return;
        if (this.scrollTimer) return;
        this.scrollTimer = setTimeout(() => {
          this.scrollTimer = undefined;
          this.progress();
        }, 60);
      },
      { passive: true },
    );
  }

  private animateEntrance(nodes: NodeListOf<HTMLElement>) {
    if (this.host.reduced()) return;
    nodes.forEach((node, index) => {
      const animation = node.animate(
        [
          { opacity: 0, transform: "translateY(36px)", filter: "blur(2px)" },
          { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
        ],
        {
          duration: 420,
          delay: index * 45,
          easing: "cubic-bezier(.2,.75,.2,1)",
          fill: "backwards",
        },
      );
      this.entrance.push(animation);
    });
  }

  private description(text: string) {
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", text);
  }
  private renderExtraction() {
    this.root.innerHTML = `${this.header()}<div class="blog-scroll"><div class="blog-reading-layout"><aside class="blog-reading-aside"><a class="blog-back">← 文章索引</a><details class="blog-toc"><summary>本文目录 <span>CONTENTS</span></summary></details><div class="blog-reading-tools"><button>专注阅读 ↗</button><div><button>A−</button><span>${this.fontSize}</span><button>A＋</button></div><button>返回顶部 ↑</button></div></aside><div class="blog-article"><div class="blog-document-destination" data-document-destination></div></div></div></div>`;
  }
  private bindReadingScroll() {
    const scroll = this.root.querySelector<HTMLElement>(".blog-scroll");
    if (scroll)
      scroll.scrollTop = this.positions.get(this.root.dataset.route ?? "") ?? 0;
    scroll?.addEventListener("scroll", () => this.progress(), {
      passive: true,
    });
  }
  private header() {
    return `<header class="blog-header"><a class="blog-wordmark" href="#/" aria-label="莱茵手记首页"><b>RHINE<span> JOURNAL</span></b><small>莱茵手记 / IDEAS IN PROGRESS</small></a><nav aria-label="博客导航"><a href="#/">文章</a><a href="#/?saved=1">收藏 <span class="blog-saved-count">${this.saved.size}</span></a>${this.sceneUnavailable ? '<span role="status">三维暂不可用</span>' : '<a href="#/experience">三维书架 ↗</a>'}<button data-blog="theme" aria-label="切换明暗主题">◐ <span>配色</span></button></nav></header>`;
  }
  private footer() {
    return `<footer class="blog-footer"><span>RHINE JOURNAL <i>／</i> 记录 · 思考 · 分享</span>${this.sceneUnavailable ? "" : '<button data-blog="replay">重播开场 ↗</button>'}</footer>`;
  }

  private renderList(params: URLSearchParams) {
    const categories = [...new Set(posts.map((post) => post.category))];
    const tags = [...new Set(posts.flatMap((post) => post.tags))];
    this.root.innerHTML = `${this.header()}<div class="blog-scroll" tabindex="-1"><main class="blog-index"><div class="blog-intro"><div class="blog-eyebrow">PERSONAL NOTES & EXPLORATIONS <span>${posts.length ? "01" : "00"} — ${String(posts.length).padStart(2, "0")}</span></div><h1 tabindex="-1">记录思考，<br>让灵感有迹可循<span>。</span></h1><p>在技术与日常之间，留下一些值得回看的文字。</p><div class="blog-intro-line"></div></div><section class="blog-library" aria-label="文章目录"><div class="blog-library-top"><h2>${params.has("saved") ? "我的收藏" : "文章索引"} <small>/ JOURNAL INDEX</small></h2><span>${posts.length} 篇文章</span></div><form class="blog-filters" role="search"><label class="blog-search"><span>⌕</span><input id="blog-query" type="search" placeholder="搜索标题、标签或正文…" aria-label="全文搜索" value="${esc(params.get("q") ?? "")}"><kbd>/</kbd></label><div class="blog-selects"><label>分类<select id="blog-category" data-blog-filter><option value="">全部分类</option>${categories.map((category) => `<option${params.get("category") === category ? " selected" : ""}>${esc(category)}</option>`).join("")}</select></label><label>标签<select id="blog-tag" data-blog-filter><option value="">全部标签</option>${tags.map((tag) => `<option${params.get("tag") === tag ? " selected" : ""}>${esc(tag)}</option>`).join("")}</select></label><label>排序<select id="blog-order" data-blog-filter>${[
      ["newest", "最新发布"],
      ["oldest", "最早发布"],
      ["title", "标题顺序"],
    ]
      .map(
        ([value, text]) =>
          `<option value="${value}"${params.get("sort") === value ? " selected" : ""}>${text}</option>`,
      )
      .join(
        "",
      )}</select></label></div></form><div class="blog-category-bar"><a href="#/" class="${!params.get("category") && !params.has("saved") ? "active" : ""}">全部 <span>${posts.length}</span></a>${categories.map((category) => `<a href="#/?category=${encodeURIComponent(category)}" class="${params.get("category") === category ? "active" : ""}">${esc(category)} <span>${posts.filter((post) => post.category === category).length}</span></a>`).join("")}</div><div id="blog-results"></div></section>${this.footer()}</main></div>`;
    this.root
      .querySelector("form")!
      .addEventListener("submit", (event) => event.preventDefault());
    this.results(params);
  }

  private filterChanged() {
    const params = new URLSearchParams(location.hash.split("?")[1] ?? "");
    for (const [key, id] of [
      ["q", "blog-query"],
      ["category", "blog-category"],
      ["tag", "blog-tag"],
      ["sort", "blog-order"],
    ]) {
      const value = this.root.querySelector<HTMLInputElement>(`#${id}`)!.value;
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    const hash = `#/${params.size ? "?" + params : ""}`;
    history.replaceState(null, "", hash);
    this.lastList = hash;
    this.root.dataset.route = hash;
    this.results(params);
    this.root.querySelectorAll(".blog-category-bar a").forEach((link) => {
      const category =
        new URLSearchParams(
          (link.getAttribute("href") ?? "").split("?")[1] ?? "",
        ).get("category") ?? "";
      link.classList.toggle(
        "active",
        category === (params.get("category") ?? "") && !params.has("saved"),
      );
    });
  }

  private results(params: URLSearchParams) {
    const filtered = queryPosts(
      posts,
      params.get("q") ?? "",
      params.get("category") ?? "",
      params.get("tag") ?? "",
      params.get("sort") ?? "newest",
      params.has("saved") ? this.saved : undefined,
    );
    const pages = Math.max(1, Math.ceil(filtered.length / 8));
    const page = Math.min(
      pages,
      Math.max(1, Math.floor(Number(params.get("page"))) || 1),
    );
    const pageLink = (number: number) => {
      const next = new URLSearchParams(params);
      next.set("page", String(number));
      return `#/?${next}`;
    };
    this.root.querySelector("#blog-results")!.innerHTML =
      `<p class="blog-result-count" role="status">${filtered.length} 篇${params.has("saved") ? "收藏" : ""}文章${params.get("q") ? ` · 搜索「${esc(params.get("q")!)}」` : ""}</p>${
        filtered.length
          ? filtered
              .slice((page - 1) * 8, page * 8)
              .map(
                (post, index) =>
                  `<article class="blog-card"><div class="blog-card-number">${String((page - 1) * 8 + index + 1).padStart(2, "0")}</div><div><div class="blog-card-meta"><span>${esc(post.category)}</span><time datetime="${post.date}">${post.date.replaceAll("-", ".")}</time>${post.featured ? '<span class="blog-featured">精选</span>' : ""}</div><h3><a href="${href(post)}">${esc(post.title)}<span aria-hidden="true">↗</span></a></h3><p>${esc(post.description)}</p><div class="blog-card-bottom"><div>${post.tags.map((tag) => `<a href="#/?tag=${encodeURIComponent(tag)}">#${esc(tag)}</a>`).join("")}</div><span>${post.minutes} 分钟阅读</span></div></div></article>`,
              )
              .join("")
          : '<div class="blog-empty"><span>∅</span><h3>这里还没有文章</h3><p>试试其他关键词或分类，也可以回到全部文章。</p><a href="#/">重置筛选 →</a></div>'
      }${pages > 1 ? `<nav class="blog-pagination" aria-label="文章分页">${page > 1 ? `<a href="${pageLink(page - 1)}">← 上一页</a>` : ""}<span>${page} / ${pages}</span>${page < pages ? `<a href="${pageLink(page + 1)}">下一页 →</a>` : ""}</nav>` : ""}`;
  }

  private renderArticle(post: Post) {
    const clean = DOMPurify.sanitize(
      marked.parse(post.markdown, { async: false, gfm: true }) as string,
      {
        USE_PROFILES: { html: true },
        FORBID_TAGS: [
          "style",
          "form",
          "input",
          "button",
          "iframe",
          "video",
          "audio",
        ],
        FORBID_ATTR: ["style", "id", "name", "autofocus"],
      },
    );
    const parsed = document.createElement("div");
    parsed.innerHTML = clean;
    const headings = [...parsed.querySelectorAll<HTMLElement>("h1,h2,h3,h4")];
    headings.forEach((heading, index) => (heading.id = `section-${index + 1}`));
    parsed.querySelectorAll("a").forEach((link) => {
      if (/^https?:/.test(link.getAttribute("href") ?? "")) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
    });
    parsed.querySelectorAll("img").forEach((img) => {
      img.loading = "lazy";
      img.decoding = "async";
    });
    parsed.querySelectorAll("table").forEach((table) => {
      const wrapper = document.createElement("div");
      wrapper.className = "blog-table-scroll";
      wrapper.tabIndex = 0;
      wrapper.setAttribute("role", "region");
      wrapper.setAttribute("aria-label", "表格，可横向滚动");
      table.replaceWith(wrapper);
      wrapper.append(table);
    });
    parsed.querySelectorAll("pre").forEach((pre) => {
      pre.tabIndex = 0;
      pre.insertAdjacentHTML(
        "beforeend",
        '<button class="blog-copy-code" data-blog="copy-code">复制代码</button>',
      );
    });
    const index = posts.indexOf(post);
    this.root.innerHTML = `${this.header()}<div class="blog-reading-progress" role="progressbar" aria-label="阅读进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div><div class="blog-scroll" tabindex="0" aria-label="文章阅读区域"><div class="blog-reading-layout"><aside class="blog-reading-aside"><a class="blog-back" href="${esc(this.lastList)}">← 文章索引</a><details class="blog-toc" open><summary>本文目录 <span>CONTENTS</span></summary><nav aria-label="文章目录">${headings.map((heading) => `<button data-section="${heading.id}" class="${heading.tagName === "H3" || heading.tagName === "H4" ? "subsection" : ""}">${esc(heading.textContent ?? "")}</button>`).join("") || "<span>暂无章节</span>"}</nav></details><div class="blog-reading-tools"><button data-blog="focus" aria-pressed="${this.focused}">${this.focused ? "退出专注" : "专注阅读"} ↗</button><div><button data-blog="smaller" aria-label="缩小正文字号">A−</button><span id="blog-font-size">${this.fontSize}</span><button data-blog="larger" aria-label="放大正文字号">A＋</button></div><button data-blog="top">返回顶部 ↑</button></div></aside><main class="blog-article"><header class="blog-article-header"><div class="blog-eyebrow"><a href="#/?category=${encodeURIComponent(post.category)}">${esc(post.category)}</a><span>JOURNAL / ${String(index + 1).padStart(2, "0")}</span></div><h1 tabindex="-1">${esc(post.title)}</h1><p class="blog-deck">${esc(post.description)}</p><div class="blog-byline"><span>${esc(post.author)}</span><time datetime="${post.date}">${post.date}</time><span>${post.minutes} 分钟阅读</span></div><div class="blog-article-actions"><button data-blog="save" aria-pressed="${this.saved.has(post.slug)}">${this.saved.has(post.slug) ? "− 取消收藏" : "＋ 收藏文章"}</button><button data-blog="share">复制链接 ↗</button><a href="${assetUrl(`archives/${post.slug}.md`)}" download="${post.slug}.md">下载原文 ↓</a><span id="blog-feedback" role="status"></span></div></header><div class="blog-prose">${parsed.innerHTML}</div><div class="blog-end"><span>— END OF NOTE —</span><div>${post.tags.map((tag) => `<a href="#/?tag=${encodeURIComponent(tag)}">#${esc(tag)}</a>`).join("")}</div></div><nav class="blog-adjacent" aria-label="相邻文章">${index > 0 ? `<a href="${href(posts[index - 1])}"><small>← 较新文章</small>${esc(posts[index - 1].title)}</a>` : "<span></span>"}${index < posts.length - 1 ? `<a href="${href(posts[index + 1])}"><small>较早文章 →</small>${esc(posts[index + 1].title)}</a>` : ""}</nav>${this.footer()}</main></div></div>`;
    const scroll = this.root.querySelector<HTMLElement>(".blog-scroll")!;
    if (matchMedia("(max-width: 700px)").matches)
      this.root.querySelector<HTMLDetailsElement>(".blog-toc")!.open = false;
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            this.root
              .querySelectorAll("[data-section]")
              .forEach((button) =>
                button.setAttribute(
                  "aria-current",
                  String(
                    (button as HTMLElement).dataset.section === entry.target.id,
                  ),
                ),
              );
          }
      },
      { root: scroll, rootMargin: "-5% 0px -65% 0px", threshold: 0 },
    );
    this.root
      .querySelectorAll(
        ".blog-prose h1,.blog-prose h2,.blog-prose h3,.blog-prose h4",
      )
      .forEach((heading) => this.observer!.observe(heading));
  }

  private progress() {
    const scroll = this.root.querySelector<HTMLElement>(".blog-scroll");
    const bar = this.root.querySelector<HTMLElement>(".blog-reading-progress");
    if (!scroll || !bar) return;
    const extent = scroll.scrollHeight - scroll.clientHeight;
    const percent =
      extent <= 0
        ? 100
        : Math.min(100, Math.round((scroll.scrollTop / extent) * 100));
    bar.setAttribute("aria-valuenow", String(percent));
    bar.querySelector("i")!.style.width = `${percent}%`;
  }

  private notFound() {
    this.host.home();
    document.title = `文章未找到 · 莱茵手记`;
    this.root.innerHTML = `${this.header()}<div class="blog-scroll"><main class="blog-not-found"><div class="blog-eyebrow">404 / NOTE NOT FOUND</div><h1 tabindex="-1">这篇文章暂时不在这里。</h1><p>链接可能有误，或文章已被移除。</p><a href="#/">返回文章索引 →</a></main></div>`;
  }

  private search() {
    if (this.current || !this.root.querySelector("#blog-query")) {
      history.pushState(null, "", "#/");
      this.route();
    }
    this.root.querySelector<HTMLInputElement>("#blog-query")?.focus();
  }

  private async copy(text: string, feedback: HTMLElement | null) {
    try {
      await navigator.clipboard.writeText(text);
      if (feedback) feedback.textContent = "已复制";
    } catch {
      if (feedback) feedback.textContent = "无法复制，请手动选择复制";
    }
  }

  private click(event: MouseEvent) {
    if ((event.target as Element).closest('[data-blog="skip-article"]')) {
      if (this.extracting) this.host.skipArticle();
      return;
    }
    const link = (event.target as Element).closest<HTMLAnchorElement>("a");
    if (link?.getAttribute("href")?.startsWith("#section-")) {
      const heading = this.root.querySelector<HTMLElement>(
        `[id="${CSS.escape(link.hash.slice(1))}"]`,
      );
      if (heading) {
        event.preventDefault();
        heading.scrollIntoView({
          behavior: this.host.reduced() ? "instant" : "smooth",
        });
      }
    }
    const target = (event.target as Element).closest<HTMLElement>("button");
    if (!target) return;
    const action = target.dataset.blog;
    if (target.dataset.section) {
      const heading = this.root.querySelector<HTMLElement>(
        `#${target.dataset.section}`,
      );
      heading?.scrollIntoView({
        behavior: this.host.reduced() ? "instant" : "smooth",
        block: "start",
      });
      heading?.setAttribute("tabindex", "-1");
      heading?.focus({ preventScroll: true });
    }
    if (action === "theme") this.host.theme();
    if (action === "replay") this.host.replay();
    if (action === "save" && this.current) {
      const slug = this.current.slug;
      if (this.saved.has(slug)) this.saved.delete(slug);
      else this.saved.add(slug);
      persist("rhine-blog-saved", [...this.saved]);
      target.textContent = this.saved.has(slug) ? "− 取消收藏" : "＋ 收藏文章";
      target.setAttribute("aria-pressed", String(this.saved.has(slug)));
      this.root.querySelector(".blog-saved-count")!.textContent = String(
        this.saved.size,
      );
      this.root.querySelector("#blog-feedback")!.textContent = this.saved.has(
        slug,
      )
        ? "已收藏到本机"
        : "已取消收藏";
    }
    if (action === "share")
      void this.copy(location.href, this.root.querySelector("#blog-feedback"));
    if (action === "copy-code")
      void this.copy(
        target.closest("pre")?.querySelector("code")?.textContent ?? "",
        target,
      );
    if (action === "focus") {
      this.focused = !this.focused;
      persist("rhine-blog-focus", this.focused);
      this.root.classList.toggle("is-focused", this.focused);
      target.textContent = this.focused ? "退出专注 ↙" : "专注阅读 ↗";
      target.setAttribute("aria-pressed", String(this.focused));
    }
    if (action === "smaller" || action === "larger") {
      this.fontSize = Math.max(
        16,
        Math.min(22, this.fontSize + (action === "larger" ? 1 : -1)),
      );
      persist("rhine-blog-font", this.fontSize);
      this.root.style.setProperty("--reading-size", `${this.fontSize}px`);
      this.root.querySelector("#blog-font-size")!.textContent = String(
        this.fontSize,
      );
      this.progress();
    }
    if (action === "top")
      this.root.querySelector(".blog-scroll")?.scrollTo({
        top: 0,
        behavior: this.host.reduced() ? "instant" : "smooth",
      });
  }
}
