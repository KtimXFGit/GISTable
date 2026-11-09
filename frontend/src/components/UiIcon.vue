<script setup lang="ts">
defineProps<{ name: string; size?: number }>()
/** One consistent 24×24, 2px stroke SVG icon family; no external font or CDN. */
const icons: Record<string,string> = {
  mountain:'M2 19 9 7l4 6 3-4 6 10H2z M9 7l3-3 4 5 M5 17h14',
  home:'M3 10.5 12 3l9 7.5V21h-6v-7H9v7H3V10.5z',
  layers:'M12 3 2 9l10 6 10-6-10-6z M2 13l10 6 10-6 M2 17l10 5 10-5',
  satellite:'M4 13l7-7 7 7-7 7-7-7z M8 9l7 7 M2 6l4-4 4 4-4 4-4-4z M14 18l4-4 4 4-4 4-4-4z',
  clipboard:'M9 4h6l1 2h3v15H5V6h3l1-2z M9 3h6v4H9V3z M9 12h7 M9 16h7',
  chart:'M4 20V13h4v7 M10 20V8h4v12 M16 20V4h4v16 M2 21h20',
  map:'M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2V5z M9 3v16 M15 5v16',
  menu:'M4 7h16 M4 12h16 M4 17h16',
  target:'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M12 7a5 5 0 1 0 0 10 5 5 0 1 0 0-10z M12 10a2 2 0 1 0 0 4 2 2 0 1 0 0-4z',
  point:'M12 22s-7-7-7-12a7 7 0 0 1 14 0c0 5-7 12-7 12z M12 7a3 3 0 1 0 0 6 3 3 0 1 0 0-6z',
  route:'M4 18a2 2 0 1 0 0 4 2 2 0 1 0 0-4z M20 2a2 2 0 1 0 0 4 2 2 0 1 0 0-4z M6 20h7c8 0 8-15 3-15h-8 M8 5H4a3 3 0 0 0 0 6h5',
  polygon:'M4 4h5v5H4z M16 4h5v5h-5z M9 16h6v6H9z M9 6h7 M18 9l-3 7 M10 19H9 M6 9l4 7',
  ruler:'M3 16 16 3l5 5L8 21l-5-5z M14 5l3 3 M11 8l2 2 M8 11l3 3 M5 14l2 2',
  area:'M4 4h16v16H4z M4 10h16 M10 4v16 M10 10h10',
  undo:'M9 14 4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
  redo:'M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3',
  trash:'M3 6h18 M8 6V4h8v2 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',
  upload:'M12 16V3 M7 8l5-5 5 5 M4 16v4h16v-4',
  download:'M12 3v13 M7 11l5 5 5-5 M4 17v4h16v-4',
  crosshair:'M12 2v4 M12 18v4 M2 12h4 M18 12h4 M12 7a5 5 0 1 0 0 10 5 5 0 1 0 0-10z',
  zoomIn:'M11 3a8 8 0 1 0 0 16 8 8 0 1 0 0-16z M17 17l5 5 M7 11h8 M11 7v8',
  zoomOut:'M11 3a8 8 0 1 0 0 16 8 8 0 1 0 0-16z M17 17l5 5 M7 11h8',
  fullscreen:'M3 9V3h6 M15 3h6v6 M21 15v6h-6 M9 21H3v-6',
  database:'M12 3c5 0 9 1.4 9 3s-4 3-9 3-9-1.4-9-3 4-3 9-3z M3 6v6c0 2 4 3 9 3s9-1 9-3V6 M3 12v6c0 2 4 3 9 3s9-1 9-3v-6',
  search:'M10.7 3a7.7 7.7 0 1 0 0 15.4 7.7 7.7 0 1 0 0-15.4z M16.2 16.2 21 21',
  eye:'M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6z',
  image:'M3 4h18v16H3z M8 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3z M3 17l5-5 4 4 4-5 5 6',
  swap:'M4 7h15l-4-4 M19 7l-4 4 M20 17H5l4-4 M5 17l4 4',
  scan:'M9 3H4v5 M15 3h5v5 M20 16v5h-5 M9 21H4v-5 M7 12h10',
  alert:'M12 3 2 21h20L12 3z M12 9v5 M12 18v.1',
  checkCircle:'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18z M8 12l3 3 5-6',
  chevronRight:'M9 5l7 7-7 7',
  calendar:'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h3',
  list:'M8 6h13 M8 12h13 M8 18h13 M3 6h.1 M3 12h.1 M3 18h.1',
  radar:'M12 2v10l6-6 M12 4a8 8 0 1 0 8 8 M4 12a8 8 0 0 0 8 8 M12 9a3 3 0 1 0 0 6',
  progress:'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18z M12 7v5l3 2',
  information:'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18z M12 10v6 M12 7v.1',
  shield:'M12 2l8 4v6c0 5-4 8-8 10-4-2-8-5-8-10V6l8-4z M9 12l2 2 4-4',
  settings:'M12 3v2 M12 19v2 M4 12H2 M22 12h-2 M5 5l2 2 M17 17l2 2 M19 5l-2 2 M7 17l-2 2 M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8z',
  activity:'M3 12h4l3-7 4 14 3-7h4',
  cursor:'M4 3v17l5-5 4 7 3-2-4-7 8-1L4 3z',
  clock:'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18z M12 7v5l4 2',
  plus:'M12 4v16 M4 12h16',
  minus:'M4 12h16',
  check:'M4 12l5 5L20 6',
}
</script>

<template>
  <svg class="ui-icon" :width="size || 20" :height="size || 20" viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor"
    stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false">
    <path :d="icons[name] || icons.layers" />
  </svg>
</template>
