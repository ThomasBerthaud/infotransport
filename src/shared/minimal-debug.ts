// Keep the diagnostic independent of React and compatible with older display browsers.
export function minimalDebugMarkup(
  enabled: boolean | undefined,
  viewport?: { width: number; height: number },
): string {
  if (!enabled) return '';
  const label = viewport
    ? `Zone utile : ${viewport.width} × ${viewport.height} px`
    : 'Zone utile : JavaScript requis';
  const badge = `<div id="minimal-debug" class="minimal-debug">${label}</div>`;
  if (viewport) return badge;
  return `${badge}<script>(function () {
  function updateDimensions() {
    var root = document.documentElement;
    var width = window.innerWidth || root.clientWidth;
    var height = window.innerHeight || root.clientHeight;
    document.getElementById('minimal-debug').textContent = 'Zone utile : ' + width + ' × ' + height + ' px';
  }
  updateDimensions();
  window.addEventListener('resize', updateDimensions);
}());</script>`;
}
