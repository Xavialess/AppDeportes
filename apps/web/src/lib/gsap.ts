let pluginRegistered = false;

export async function loadGsap() {
  const gsapModule = await import('gsap');
  const { ScrollTrigger } = await import('gsap/ScrollTrigger');
  const gsap = gsapModule.default;

  if (!pluginRegistered) {
    gsap.registerPlugin(ScrollTrigger);
    pluginRegistered = true;
  }

  return gsap;
}
