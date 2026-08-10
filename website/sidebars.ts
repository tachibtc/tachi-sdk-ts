import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';
import {loadSpec} from './src/components/RpcReference/lib/spec';
import rawRpcSpec from './src/components/RpcReference/openapi.json';

const rpcSpec = loadSpec(rawRpcSpec as never);
const rpcOpsByTag = new Map<string, typeof rpcSpec.operations>();
for (const tag of rpcSpec.tags) rpcOpsByTag.set(tag, []);
for (const op of rpcSpec.operations) for (const tag of op.tags) rpcOpsByTag.get(tag)?.push(op);

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    'tutorial',
    'api-reference',
    {
      type: 'category',
      label: 'RPC Reference',
      link: {type: 'doc', id: 'rpc-reference'},
      items: rpcSpec.tags.map((tag) => ({
        type: 'category' as const,
        label: tag,
        items: (rpcOpsByTag.get(tag) ?? []).map((op) => ({
          type: 'html' as const,
          value: `<a class="menu__link rpc-sidebar-link" href="/rpc-reference#${op.slug}">
            <span class="rpc-sidebar-label">${escapeHtml(op.summary ?? op.path)}</span>
            <span class="rpc-sidebar-method rpc-sidebar-method-${op.method.toLowerCase()}">${escapeHtml(op.method)}</span>
          </a>`,
        })),
      })),
    },
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
