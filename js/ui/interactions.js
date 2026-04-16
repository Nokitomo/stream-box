function scrollTrack(trigger, direction) {
  const track = trigger.closest(".rail-block")?.querySelector(".rail-track");
  if (!track) {
    return;
  }

  const delta = Math.min(track.clientWidth * 0.9, 820) * direction;
  track.scrollBy({ left: delta, behavior: "smooth" });
}

export function initInteractions(store, renderer) {
  const header = document.getElementById("mainHeader");
  const railsRoot = document.getElementById("railsRoot");
  const searchInput = document.getElementById("searchInput");
  const heroPlayBtn = document.getElementById("heroPlayBtn");
  const heroInfoBtn = document.getElementById("heroInfoBtn");
  const profileToggle = document.getElementById("profileToggle");
  const profileMenu = document.getElementById("profileMenu");
  const detailsModal = document.getElementById("detailsModal");
  const modalToggleList = document.getElementById("modalToggleList");
  const modalPlay = document.querySelector('[data-modal-action="play"]');

  function updateHeaderState() {
    header.classList.toggle("scrolled", window.scrollY > 18);
  }

  function handleTitleAction(action, id) {
    const item = renderer.getItemById(id);
    if (!item) {
      return;
    }

    if (action === "play") {
      renderer.showToast(`Riproduzione: ${item.title}`);
      return;
    }

    if (action === "toggle-list") {
      const added = store.toggleList(item.id);
      renderer.showToast(added ? `"${item.title}" aggiunto a La mia lista` : `"${item.title}" rimosso da La mia lista`);
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
    const action = actionButton?.dataset.action ?? "details";
    handleTitleAction(action, card.dataset.id);
  });

  modalToggleList.addEventListener("click", () => {
    const id = modalToggleList.dataset.id;
    if (!id) {
      return;
    }

    const item = renderer.getItemById(id);
    const added = store.toggleList(id);
    renderer.showToast(added ? `"${item.title}" aggiunto a La mia lista` : `"${item.title}" rimosso da La mia lista`);
  });

  modalPlay.addEventListener("click", () => {
    const id = modalToggleList.dataset.id;
    const item = renderer.getItemById(id);
    if (!item) {
      return;
    }

    renderer.showToast(`Riproduzione: ${item.title}`);
  });

  detailsModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-modal]")) {
      store.closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      store.closeModal();
      profileMenu.hidden = true;
      profileToggle.setAttribute("aria-expanded", "false");
    }
  });

  profileToggle.addEventListener("click", () => {
    const isOpen = !profileMenu.hidden;
    profileMenu.hidden = isOpen;
    profileToggle.setAttribute("aria-expanded", String(!isOpen));
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest(".profile-wrap")) {
      return;
    }

    profileMenu.hidden = true;
    profileToggle.setAttribute("aria-expanded", "false");
  });

  window.addEventListener("scroll", updateHeaderState, { passive: true });
  updateHeaderState();
}
