import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    'tutorial',
    'api-reference',
    {
      type: 'category',
      label: 'Taurus Vault Core',
      items: [
        'vault/overview',
        'vault/api',
        'vault/vtxo',
      ],
    },
  ],
};

export default sidebars;
