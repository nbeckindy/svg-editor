export interface TestIcon {
  id: string;
  label: string;
  svg: string;
}

export const TEST_ICONS: TestIcon[] = [
  {
    id: 'chat-left-heart',
    label: 'Chat left heart',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-chat-left-heart" viewBox="0 0 16 16">
  <path d="M14 1a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4.414A2 2 0 0 0 3 11.586l-2 2V2a1 1 0 0 1 1-1zM2 0a2 2 0 0 0-2 2v12.793a.5.5 0 0 0 .854.353l2.853-2.853A1 1 0 0 1 4.414 12H14a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2z"/>
  <path d="M8 3.993c1.664-1.711 5.825 1.283 0 5.132-5.825-3.85-1.664-6.843 0-5.132"/>
</svg>`
  },
  {
    id: 'clipboard2-data',
    label: 'Clipboard2 data',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-clipboard2-data" viewBox="0 0 16 16">
  <path d="M9.5 0a.5.5 0 0 1 .5.5.5.5 0 0 0 .5.5.5.5 0 0 1 .5.5V2a.5.5 0 0 1-.5.5h-5A.5.5 0 0 1 5 2v-.5a.5.5 0 0 1 .5-.5.5.5 0 0 0 .5-.5.5.5 0 0 1 .5-.5z"/>
  <path d="M3 2.5a.5.5 0 0 1 .5-.5H4a.5.5 0 0 0 0-1h-.5A1.5 1.5 0 0 0 2 2.5v12A1.5 1.5 0 0 0 3.5 16h9a1.5 1.5 0 0 0 1.5-1.5v-12A1.5 1.5 0 0 0 12.5 1H12a.5.5 0 0 0 0 1h.5a.5.5 0 0 1 .5.5v12a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5z"/>
  <path d="M10 7a1 1 0 1 1 2 0v5a1 1 0 1 1-2 0zm-6 4a1 1 0 1 1 2 0v1a1 1 0 1 1-2 0zm4-3a1 1 0 0 0-1 1v3a1 1 0 1 0 2 0V9a1 1 0 0 0-1-1"/>
</svg>`
  },
  {
    id: 'chat-left-heart-fill',
    label: 'Chat left heart fill',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-chat-left-heart-fill" viewBox="0 0 16 16">
  <path d="M2 0a2 2 0 0 0-2 2v12.793a.5.5 0 0 0 .854.353l2.853-2.853A1 1 0 0 1 4.414 12H14a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2zm6 3.993c1.664-1.711 5.825 1.283 0 5.132-5.825-3.85-1.664-6.843 0-5.132"/>
</svg>`
  },
  {
    id: 'groups-layers-test',
    label: 'Groups & Layers',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <rect id="background" x="0" y="0" width="400" height="300" fill="#f0f4f8" data-name="Background"/>
  <g id="house" data-name="House">
    <rect id="house-body" x="50" y="120" width="120" height="100" fill="#d4a373" stroke="#8b6914" stroke-width="2" data-name="Walls"/>
    <polygon id="house-roof" points="110,70 40,130 180,130" fill="#bc4749" stroke="#8b1a1a" stroke-width="2" data-name="Roof"/>
    <rect id="house-door" x="90" y="170" width="30" height="50" fill="#5a3e2b" rx="2" data-name="Door"/>
    <rect id="house-window" x="130" y="150" width="25" height="25" fill="#a8dadc" stroke="#457b9d" stroke-width="1.5" rx="2" data-name="Window"/>
  </g>
  <g id="tree" data-name="Tree">
    <g id="tree-trunk" data-name="Trunk">
      <rect id="trunk-main" x="225" y="160" width="20" height="60" fill="#6b4226" data-name="Main trunk"/>
      <rect id="trunk-base" x="220" y="210" width="30" height="10" fill="#5a3520" rx="3" data-name="Root base"/>
    </g>
    <g id="tree-canopy" data-name="Canopy">
      <ellipse id="canopy-back" cx="235" cy="140" rx="45" ry="35" fill="#2d6a4f" opacity="0.8" data-name="Back leaves"/>
      <ellipse id="canopy-mid" cx="235" cy="130" rx="38" ry="30" fill="#40916c" data-name="Middle leaves"/>
      <ellipse id="canopy-front" cx="235" cy="122" rx="30" ry="24" fill="#52b788" data-name="Front leaves"/>
    </g>
  </g>
  <g id="sky-objects" data-name="Sky objects">
    <circle id="sun" cx="340" cy="50" r="30" fill="#fca311" data-name="Sun"/>
    <circle id="sun-glow" cx="340" cy="50" r="42" fill="#fca311" opacity="0.15" data-name="Sun glow"/>
    <g id="cloud" data-name="Cloud" style="display: none">
      <ellipse id="cloud-left" cx="80" cy="45" rx="25" ry="15" fill="#ffffff" data-name="Cloud left"/>
      <ellipse id="cloud-center" cx="105" cy="38" rx="30" ry="20" fill="#ffffff" data-name="Cloud center"/>
      <ellipse id="cloud-right" cx="130" cy="45" rx="25" ry="15" fill="#ffffff" data-name="Cloud right"/>
    </g>
  </g>
  <defs>
    <clipPath id="fence-clip">
      <rect x="290" y="170" width="100" height="60"/>
    </clipPath>
  </defs>
  <g clip-path="url(#fence-clip)">
    <rect id="fence-post-1" x="295" y="170" width="8" height="50" fill="#c9a96e" data-name="Post 1"/>
    <rect id="fence-post-2" x="315" y="170" width="8" height="50" fill="#c9a96e" data-name="Post 2"/>
    <rect id="fence-post-3" x="335" y="170" width="8" height="50" fill="#c9a96e" data-name="Post 3"/>
    <rect id="fence-rail-top" x="290" y="178" width="60" height="4" fill="#b5873a" data-name="Top rail"/>
    <rect id="fence-rail-bottom" x="290" y="200" width="60" height="4" fill="#b5873a" data-name="Bottom rail"/>
  </g>
  <path id="path-ground" d="M0 220 Q100 210 200 222 Q300 234 400 220 L400 300 L0 300 Z" fill="#606c38" data-name="Ground"/>
  <line id="horizon-line" x1="0" y1="220" x2="400" y2="220" stroke="#3a5a40" stroke-width="1" opacity="0.4" data-name="Horizon"/>
</svg>`
  }
];
