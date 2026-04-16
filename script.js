const rail = document.getElementById('posterRail');
const controls = document.querySelectorAll('.slider-btn');

controls.forEach((button) => {
  button.addEventListener('click', () => {
    const direction = button.dataset.dir === 'next' ? 1 : -1;
    const amount = Math.min(rail.clientWidth * 0.78, 720) * direction;
    rail.scrollBy({ left: amount, behavior: 'smooth' });
  });
});

document.querySelectorAll('.faq-item').forEach((item) => {
  const trigger = item.querySelector('.faq-question');
  trigger.addEventListener('click', () => {
    const isOpen = item.classList.contains('active');
    document.querySelectorAll('.faq-item').forEach((faq) => {
      faq.classList.remove('active');
      faq.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
    });

    if (!isOpen) {
      item.classList.add('active');
      trigger.setAttribute('aria-expanded', 'true');
    }
  });
});

function wireFakeSubmit(formId) {
  const form = document.getElementById(formId);
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = form.querySelector('input[type="email"]');
    const value = input.value.trim();

    if (!value) {
      input.focus();
      return;
    }

    const original = form.querySelector('.cta-btn').innerHTML;
    form.querySelector('.cta-btn').innerHTML = 'Pronto';
    form.querySelector('.cta-btn').disabled = true;

    setTimeout(() => {
      form.querySelector('.cta-btn').innerHTML = original;
      form.querySelector('.cta-btn').disabled = false;
      input.value = '';
    }, 1400);
  });
}

wireFakeSubmit('ctaForm');
wireFakeSubmit('bottomCtaForm');
