window.NetflixClone = window.NetflixClone || {};

(function initInteractionsFactory(app) {
  const RAIL_SCROLL_ANIMATION_MS = 420;

  function scrollTrack(trigger, direction) {
    const track = trigger.closest(".rail-block")?.querySelector(".rail-track");
    if (!track) {
      return;
    }

    clearTimeout(Number(track.dataset.scrollAnimationTimeout) || 0);
    track.classList.remove("is-scrolling-prev", "is-scrolling-next");
    track.classList.add("is-scrolling", direction > 0 ? "is-scrolling-next" : "is-scrolling-prev");
    const timeoutId = window.setTimeout(() => {
      track.classList.remove("is-scrolling", "is-scrolling-prev", "is-scrolling-next");
      track.dataset.scrollAnimationTimeout = "";
    }, RAIL_SCROLL_ANIMATION_MS);
    track.dataset.scrollAnimationTimeout = String(timeoutId);

    const delta = Math.min(track.clientWidth * 0.9, 820) * direction;
    track.scrollBy({ left: delta, behavior: "smooth" });
  }

  function findFocusable(root) {
    return [...root.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])')].filter(
      (el) => !el.hasAttribute("disabled")
    );
  }

  app.initInteractions = function initInteractions(store, renderer) {
    const header = document.getElementById("mainHeader");
    const railsRoot = document.getElementById("railsRoot");
    const searchInput = document.getElementById("searchInput");
    const footer = document.querySelector(".app-footer");
    const heroPlayBtn = document.getElementById("heroPlayBtn");
    const heroInfoBtn = document.getElementById("heroInfoBtn");
    const detailsModal = document.getElementById("detailsModal");
    const modalToggleList = document.getElementById("modalToggleList");
    const modalOpenPage = document.getElementById("modalOpenPage");
    const modalPlay = document.querySelector('[data-modal-action="play"]');
    let lastFocusedBeforeModal = null;
    let previousModalId = null;

    function updateHeaderState() {
      header.classList.toggle("scrolled", window.scrollY > 18);
    }

    function openTitlePage(id) {
      window.location.href = `title.html?id=${encodeURIComponent(id)}`;
    }

    function playTitle(id) {
      const item = renderer.getItemById(id);
      if (!item) {
        return;
      }

      store.bumpProgress(item.id, 1, item.progress);
      window.location.href = `player.html?id=${encodeURIComponent(item.id)}`;
    }

    function handleTitleAction(action, id) {
      const item = renderer.getItemById(id);
      if (!item) {
        return;
      }

      if (action === "play") {
        playTitle(item.id);
        return;
      }

      if (action === "toggle-list") {
        const added = store.toggleList(item.id);
        renderer.showToast(added ? `"${item.title}" aggiunto a La mia lista` : `"${item.title}" rimosso da La mia lista`);
        return;
      }

      if (action === "open-page") {
        openTitlePage(item.id);
        return;
      }

      store.openModal(item.id);
    }

    document.querySelector(".primary-nav")?.addEventListener("click", (event) => {
      const trigger = event.target.closest(".nav-link");
      if (!trigger) {
        return;
      }

      store.setActiveTab(trigger.dataset.tab);
    });

    searchInput.addEventListener("input", (event) => {
      store.setQuery(event.target.value.trim());
    });

    footer?.addEventListener("click", (event) => {
      const tabButton = event.target.closest("[data-tab]");
      if (!tabButton) {
        return;
      }

      store.setActiveTab(tabButton.dataset.tab);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    heroPlayBtn.addEventListener("click", () => {
      handleTitleAction("play", heroPlayBtn.dataset.id);
    });

    heroInfoBtn.addEventListener("click", () => {
      handleTitleAction("details", heroInfoBtn.dataset.id);
    });

    railsRoot.addEventListener("click", (event) => {
      const scrollButton = event.target.closest("[data-scroll]");
      if (scrollButton) {
        const direction = scrollButton.dataset.scroll === "next" ? 1 : -1;
        scrollTrack(scrollButton, direction);
        return;
      }

      const card = event.target.closest(".media-card");
      if (!card) {
        return;
      }

      const actionButton = event.target.closest("[data-action]");
      const action = actionButton?.dataset.action || "details";
      handleTitleAction(action, card.dataset.id);
    });

    modalToggleList.addEventListener("click", () => {
      const id = modalToggleList.dataset.id;
      const item = renderer.getItemById(id);
      if (!id || !item) {
        return;
      }

      const added = store.toggleList(id);
      renderer.showToast(added ? `"${item.title}" aggiunto a La mia lista` : `"${item.title}" rimosso da La mia lista`);
    });

    modalOpenPage.addEventListener("click", () => {
      const id = modalOpenPage.dataset.id;
      if (!id) {
        return;
      }

      openTitlePage(id);
    });

    modalPlay.addEventListener("click", () => {
      playTitle(modalToggleList.dataset.id);
    });

    detailsModal.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-modal]")) {
        store.closeModal();
      }
    });

    document.addEventListener("keydown", (event) => {
      const hasModalOpen = !!store.getState().selectedId;
      if (event.key === "Escape" && hasModalOpen) {
        store.closeModal();
        return;
      }

      if (event.key !== "Tab" || !hasModalOpen) {
        return;
      }

      const focusable = findFocusable(detailsModal);
      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    });

    function syncModalAccessibility(state) {
      const justOpened = state.selectedId && !previousModalId;
      const justClosed = !state.selectedId && previousModalId;

      if (justOpened) {
        lastFocusedBeforeModal = document.activeElement;
        document.body.style.overflow = "hidden";
        setTimeout(() => {
          detailsModal.querySelector(".modal-close")?.focus();
        }, 0);
      }

      if (justClosed) {
        document.body.style.overflow = "";
        if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === "function") {
          lastFocusedBeforeModal.focus();
        }
      }

      previousModalId = state.selectedId;
    }

    store.subscribe(syncModalAccessibility);
    syncModalAccessibility(store.getState());

    window.addEventListener("scroll", updateHeaderState, { passive: true });
    updateHeaderState();
  };
})(window.NetflixClone);
