// Site-wide settings and the three work categories. The order of CATEGORIES is
// the order shown in the nav, on the homepage and in the sitemap.

export const SITE = {
  name: 'Lophy Sophy',
  author: 'Sofia Lucarelli',
  url: 'https://lophysophy.com',
  email: 'lophy.sophy@gmail.com',
  instagram: 'https://www.instagram.com/lophy.sophy',
  cv: '/assets/CV.pdf',
  role: 'Visual Development · Character Design · 2D Animation',
  school: 'MA Character Animation, Gobelins Paris',
  description:
    'Portfolio of Sofia Lucarelli, alias Lophy Sophy. Visual development, character design, 2D animation and traditional illustration. Character Animation student at Gobelins Paris.',
  showreelId: 'TLMJ2PamPaI',
};

export interface CategoryConfig {
  /** Folder under src/work/ holding this category's project folders. */
  dir: string;
  slug: string;
  title: string;
  /** Short terms shown as chips on the category page and under the home title. */
  tags: string[];
  /** Trusted HTML shown under the chips. */
  intro: string;
  description: string;
  /** Homepage mosaic: how many projects to show, and an optional row scale. */
  homeLimit: number;
  homeScale?: number;
}

export const CATEGORIES: CategoryConfig[] = [
  {
    dir: 'VISUAL DEVELOPMENT',
    slug: 'visual-development',
    title: 'Visual Development',
    tags: ['Concept Art', 'BG Painting', 'Character Design'],
    intro:
      'A collection of a few projects I worked on. Each section contains early studies, environment designs, color keys and character explorations. Some projects also come with keyframes from the storyboard. Check out the last section for some fun random stuff.',
    description:
      'Visual development by Sofia Lucarelli, alias Lophy Sophy: concept art, background painting, color keys and character design.',
    homeLimit: 3,
    homeScale: 1.1,
  },
  {
    dir: 'ILLUSTRATION',
    slug: 'illustration',
    title: 'Illustration',
    tags: ['Watercolor', 'Life Drawing', 'Colored Pencil'],
    intro:
      'Before working digitally I trained in traditional media, and I keep returning to them. This is a collection of artworks and life drawings made with watercolors, colored pencils and charcoals, but also different etching techniques.',
    description:
      'Traditional illustration by Sofia Lucarelli, alias Lophy Sophy: watercolor, life drawing, colored pencil and etching.',
    homeLimit: 3,
  },
  {
    dir: 'ANIMATION',
    slug: 'animation',
    title: 'Animation',
    tags: ['2D Animation', 'Short Movies'],
    intro:
      'Some of my 2D animation projects, shown piece by piece: pre-prod material, rough tests, cleanups and more. Check out the full films at the end of each section or just watch my <a class="text-link" href="/showreel/">showreel</a> for the highlights! Frame-by-frame animation &lt;3',
    description:
      '2D animation projects by Sofia Lucarelli, alias Lophy Sophy: pre-production, rough tests, clean-up and finished short films.',
    homeLimit: 3,
  },
];
