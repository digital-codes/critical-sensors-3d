import type * as THREE from 'three';
import type { CameraRig } from './camera';
import { nearestSeason, type SeasonKey } from './seasons';
import photos from './photos.json';

interface PhotoEntry {
  file: string;
  date: string;
  day: number;
  preset: string;
}

const SEASON_LABELS: Record<SeasonKey, string> = {
  winter: 'Winter',
  spring: 'Frühling',
  summer: 'Sommer',
  autumn: 'Herbst',
};

function seasonLabel(day: number): string {
  return SEASON_LABELS[nearestSeason(day).key];
}

export function createComparePanel(
  renderer: THREE.WebGLRenderer,
  rig: CameraRig,
  seasonInput: HTMLInputElement | null,
): void {
  const presets = document.getElementById('presets');
  if (!presets) return;

  const toggle = document.createElement('button');
  toggle.textContent = 'Vergleich';
  presets.appendChild(toggle);

  const panel = document.createElement('div');
  panel.id = 'compare-panel';
  panel.style.display = 'none';

  const header = document.createElement('div');
  header.className = 'compare-header';

  const title = document.createElement('span');
  title.textContent = 'Vergleich: Referenzfotos';
  header.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.title = 'Schließen';
  closeBtn.addEventListener('click', () => setPanel(false));
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const body = document.createElement('div');
  body.className = 'compare-body';

  const list = document.createElement('div');
  list.className = 'compare-list';
  body.appendChild(list);

  const detail = document.createElement('div');
  detail.className = 'compare-detail';

  const largeImg = document.createElement('img');
  largeImg.alt = 'Referenzfoto';
  detail.appendChild(largeImg);

  const shotBtn = document.createElement('button');
  shotBtn.textContent = 'Screenshot aufnehmen';
  shotBtn.addEventListener('click', () => {
    const url = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `orchard_${currentDate}.png`;
    a.click();
  });
  detail.appendChild(shotBtn);
  body.appendChild(detail);
  panel.appendChild(body);
  document.body.appendChild(panel);

  let currentDate = photos[0].date;

  function selectPhoto(photo: PhotoEntry, thumb: HTMLElement): void {
    currentDate = photo.date;
    for (const t of list.querySelectorAll('.thumb')) t.classList.remove('selected');
    thumb.classList.add('selected');
    largeImg.src = photo.file;
    if (seasonInput) {
      seasonInput.value = String(photo.day);
      seasonInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    rig.applyPreset(photo.preset);
  }

  for (const photo of photos as PhotoEntry[]) {
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    const name = photo.file.split('/').pop() ?? photo.file;
    const label = document.createElement('span');
    label.textContent = `${name} · ${photo.date} · ${seasonLabel(photo.day)}`;
    thumb.appendChild(label);
    const img = document.createElement('img');
    img.src = photo.file;
    img.alt = name;
    img.loading = 'lazy';
    thumb.appendChild(img);
    thumb.addEventListener('click', () => selectPhoto(photo, thumb));
    list.appendChild(thumb);
  }

  function setPanel(open: boolean): void {
    panel.style.display = open ? 'flex' : 'none';
    toggle.classList.toggle('active', open);
  }

  toggle.addEventListener('click', () => setPanel(panel.style.display === 'none'));
}
