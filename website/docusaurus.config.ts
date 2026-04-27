import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Tachi SDK',
  tagline: 'TypeScript SDK for Tachi BTC',
  favicon: 'img/favicon.png',

  future: {
    v4: true,
  },

  url: 'https://tachibtc.github.io',
  baseUrl: '/tachi-sdk-ts/',

  organizationName: 'tachibtc',
  projectName: 'tachi-sdk-ts',

  onBrokenLinks: 'throw',
  markdown: {
    mermaid: true,
  },
  themes: ['@docusaurus/theme-mermaid'],

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
          editUrl: 'https://github.com/tachibtc/tachi-sdk-ts/tree/main/website/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    image: 'img/tachi-social-card.png',
    navbar: {
      title: 'TACHI SDK',
      style: 'dark',
      logo: {
        alt: 'Tachi Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://github.com/tachibtc/tachi-sdk-ts',
          label: 'GitHub',
          position: 'right',
        },
        {
          href: 'https://rpc-devnet.tachibtc.com/swagger/index.html',
          label: 'Swagger',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Getting Started', to: '/' },
            { label: 'Tutorial', to: '/tutorial' },
            { label: 'API Reference', to: '/api-reference' },
          ],
        },
        {
          title: 'Links',
          items: [
            { label: 'GitHub', href: 'https://github.com/tachibtc/tachi-sdk-ts' },
            { label: 'Swagger', href: 'https://rpc-devnet.tachibtc.com/swagger/index.html' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Tachi. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'typescript'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
