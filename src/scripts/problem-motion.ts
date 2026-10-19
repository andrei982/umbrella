/* «01 — Проблема»: хаос → порядок.
   Десктоп: блок закрепляется, прокрутка по очереди подсвечивает четыре проблемы (data-step 0–3),
   затем обрывки слетаются в центр и собираются в знак X (data-step 4).
   Планшет и телефон: без закрепления — обрывки собираются, пока сцена проходит через экран.
   При prefers-reduced-motion ничего не запускается: остаётся статичный разброс из CSS. */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const root = document.querySelector<HTMLElement>('[data-chaos]');
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (root && !reduce) {
  const stage = root.querySelector<HTMLElement>('.chaos__stage')!;
  const mark = stage.querySelector<HTMLElement>('.chaos__mark')!;
  const frags = gsap.utils.toArray<HTMLElement>('.frag', stage);
  const num = (el: HTMLElement, v: string) => parseFloat(el.style.getPropertyValue(v)) || 0;

  root.classList.add('is-live', 'is-float');
  // та же раскладка, что в CSS, но через GSAP — чтобы из неё можно было свести плашки к центру
  frags.forEach((f) => gsap.set(f, { xPercent: -num(f, '--x'), yPercent: -50, rotation: num(f, '--r') }));

  // смещение от текущей позиции плашки до центра сцены (offset* не зависят от transform)
  const toCenterX = (_: number, f: HTMLElement) => stage.clientWidth / 2 - (f.offsetLeft + f.offsetWidth * (0.5 - num(f, '--x') / 100));
  const toCenterY = (_: number, f: HTMLElement) => stage.clientHeight / 2 - f.offsetTop;

  const collapse = (tl: gsap.core.Timeline, at: number) => tl
    .to(frags, {
      x: toCenterX, y: toCenterY, rotation: 0, scale: 0.3, opacity: 0,
      duration: 1.4, ease: 'power2.in', stagger: { amount: 0.4, from: 'random' },
    }, at)
    .fromTo(mark, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.8, ease: 'back.out(1.6)' }, at + 1.1);

  const setStep = (step: number) => {
    const v = String(step);
    if (root.dataset.step !== v) root.dataset.step = v;
  };

  const mm = gsap.matchMedia();

  mm.add('(min-width: 1024px)', () => {
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: root, start: 'center 54%', end: () => `+=${window.innerHeight * 2.4}`,
        pin: true, scrub: 0.8, invalidateOnRefresh: true,
        onUpdate: () => setStep(tl.time() < 4 ? Math.floor(tl.time()) : 4),
        onLeaveBack: () => delete root.dataset.step,
      },
    });
    tl.to({}, { duration: 4 }); // 0–4: по единице времени на проблему
    collapse(tl, 4);
    tl.to({}, { duration: 0.6 });
    return () => delete root.dataset.step;
  });

  mm.add('(max-width: 1023.98px)', () => {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: stage, start: 'top 45%', end: 'top 0%', scrub: 0.6, invalidateOnRefresh: true,
        onUpdate: (self) => (self.progress > 0.7 ? setStep(4) : delete root.dataset.step),
      },
    });
    collapse(tl, 0);
  });
}
