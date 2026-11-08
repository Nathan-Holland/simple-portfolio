// Shared top bar for the tools on nate-holland.com.
// Put <header class="nh-top" data-nh-header></header> in the page (optionally with
// children: they go on the right), load this script, and the mark menu is filled in.
(function () {
  var ICONS = {
    home: '<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>',
    wishlist: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    weight: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 9.5a4.5 4.5 0 0 1 6 0L13 12"/>',
    budget: '<circle cx="12" cy="12" r="8"/><path d="M12 4v8l5.7 5.7"/>',
    bookmarks: '<path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-4-6 4V5.5a1 1 0 0 1 1-1z"/>',
    spanish: '<path d="M5 4.5h9a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h9"/>',
    wedding: '<circle cx="9" cy="14" r="5"/><circle cx="15" cy="14" r="5"/><path d="m10 5 2-2 2 2"/>',
    tick: '<path d="m5 12 5 5L20 7"/>'
  };
  var LINKS = [
    { href: "/home", label: "Home", icon: "home" },
    "sep",
    { href: "/wishlist", label: "Wishlist", icon: "wishlist" },
    { href: "/bookmarks", label: "Bookmarks", icon: "bookmarks" },
    { href: "/weight", label: "WeightWise", icon: "weight" },
    { href: "/budget", label: "Budget", icon: "budget" },
    { href: "/spanish", label: "Spanish", icon: "spanish" },
    { href: "/wedding", label: "Wedding", icon: "wedding" },
    "sep",
    { href: "/", label: "Portfolio", logo: true }
  ];
  var LOGO = '<svg viewBox="0 0 28 28" aria-hidden="true" style="fill:currentColor;stroke:none;width:15px;height:15px;color:var(--nh-ink)"><path d="M4 0L0 4V8L4 12H0V24L4 28H12V20L20 28H24L28 24V20L24 16H28V4L24 0H16V8L8 0H4Z"/></svg>';

  function svg(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + "</svg>"; }
  function isCurrent(href) {
    var p = location.pathname.replace(/\/index\.html$/, "").replace(/\/$/, "") || "/";
    if (href === "/") return p === "/";
    return p === href || p.indexOf(href + "/") === 0;
  }

  function build(header) {
    var right = document.createElement("div");
    right.className = "nh-top-right";
    while (header.firstChild) right.appendChild(header.firstChild);

    var items = LINKS.map(function (l) {
      if (l === "sep") return '<li class="nh-sep" role="separator"></li>';
      var cur = isCurrent(l.href);
      return '<li role="none"><a role="menuitem" href="' + l.href + '"' + (cur ? ' aria-current="page"' : "") + ">" +
        (l.logo ? LOGO : svg(l.icon)) + "<span>" + l.label + "</span>" +
        (cur ? '<svg class="nh-tick" viewBox="0 0 24 24" aria-hidden="true">' + ICONS.tick + "</svg>" : "") + "</a></li>";
    }).join("");

    var menu = document.createElement("div");
    menu.className = "nh-menu";
    menu.innerHTML =
      '<button class="nh-mark-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="Open site menu"><span class="nh-mark" aria-hidden="true"></span></button>' +
      '<ul class="nh-menu-list" role="menu" hidden>' + items + "</ul>";
    header.appendChild(menu);
    if (right.childNodes.length) header.appendChild(right);

    var btn = menu.querySelector("button");
    var list = menu.querySelector("ul");
    function set(open) {
      list.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
    }
    btn.addEventListener("click", function (e) { e.stopPropagation(); set(list.hidden); });
    document.addEventListener("click", function (e) { if (!menu.contains(e.target)) set(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") set(false); });
  }

  function init() {
    document.querySelectorAll("[data-nh-header]").forEach(build);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
