(() => {
  "use strict";
  const DEFAULT_PROFILE = "img/profile-logo.jpg";

  function safeImageUrl(value) {
    if (typeof value !== "string" || !value.trim()) return DEFAULT_PROFILE;
    try {
      const url = new URL(value, window.AGRO?.BACKEND_URL || window.location.origin);
      return ["http:", "https:"].includes(url.protocol) ? url.href : DEFAULT_PROFILE;
    } catch { return DEFAULT_PROFILE; }
  }

  function renderUserInfo(user) {
    const fullName = user?.name || "Guest User";
    const username = user?.username ? "@" + user.username : "@guest";
    const profileImg = safeImageUrl(user?.profileUrl || user?.profile);
    const fullNameNode = document.getElementById("full-name");
    const usernameNode = document.getElementById("username-display");
    if (fullNameNode) fullNameNode.textContent = fullName;
    if (usernameNode) usernameNode.textContent = username;

    ["logoutLink", "logoutLinkMobile"].forEach(id => {
      const link = document.getElementById(id);
      if (link) link.style.display = user ? "block" : "none";
    });

    const panel = document.querySelector(".panel-user-info");
    if (panel) {
      const image = document.createElement("img");
      image.src = profileImg;
      image.alt = "Profile";
      image.className = "profile-logo-slide";
      image.addEventListener("error", () => { image.src = DEFAULT_PROFILE; }, { once: true });
      const name = document.createElement("p");
      const nameLabel = document.createElement("strong");
      nameLabel.textContent = "Name: ";
      name.append(nameLabel, document.createTextNode(fullName));
      const handle = document.createElement("p");
      const handleLabel = document.createElement("strong");
      handleLabel.textContent = "Username: ";
      handle.append(handleLabel, document.createTextNode(username));
      panel.replaceChildren(image, name, handle);
    }

    const dropdownImage = document.querySelector(".profile-area img");
    if (dropdownImage) {
      dropdownImage.src = profileImg;
      dropdownImage.alt = "Profile";
      dropdownImage.addEventListener("error", () => { dropdownImage.src = DEFAULT_PROFILE; }, { once: true });
    }
  }

  window.populateHeaderSide = renderUserInfo;
  window.showUserInfo = renderUserInfo;
  window.toggleSidePanel = function () {
    document.querySelector(".side-panel")?.classList.toggle("open");
  };

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".side-toggle").forEach(toggle => {
      toggle.addEventListener("click", () => {
        const submenu = toggle.nextElementSibling;
        if (!submenu) return;
        document.querySelectorAll(".side-submenu").forEach(item => {
          if (item !== submenu) item.style.maxHeight = "";
        });
        submenu.style.maxHeight = submenu.style.maxHeight ? "" : submenu.scrollHeight + "px";
      });
    });

    document.querySelectorAll("#logoutLink, #logoutLinkMobile").forEach(link => {
      link.addEventListener("click", async event => {
        event.preventDefault();
        const backend = window.AGRO?.BACKEND_URL;
        sessionStorage.removeItem("user");
        sessionStorage.removeItem("userId");
        if (backend) {
          try { await fetch(backend + "/api/logout", { method: "POST", credentials: "include" }); }
          catch (error) { console.warn("AgroScan logout request failed:", error); }
        }
        window.location.href = "/index.html";
      });
    });
  });
})();
