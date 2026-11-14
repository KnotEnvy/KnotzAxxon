import { prepareCoolingStack } from './streaming-adapter.mjs';

export async function installCoolingStackPrototype(fortress, { templateUrl, fetchImpl = fetch }) {
  if (fortress.chunks.size || fortress.emitters.length) throw new Error('Install cooling templates before first chunk construction');
  const response = await fetchImpl(templateUrl);
  if (!response.ok) throw new Error(`Cooling template load failed: ${response.status}`);
  const prepared = prepareCoolingStack(await response.json());
  const original = fortress._coolingStack;
  const hadOwnMethod = Object.hasOwn(fortress, '_coolingStack');
  fortress._coolingStack = prepared.coolingStack;
  let active = true;
  return Object.freeze({
    shutdown() {
      if (!active) return;
      if (fortress._coolingStack !== prepared.coolingStack) throw new Error('Cooling method changed while prototype installed');
      if (hadOwnMethod) fortress._coolingStack = original;
      else delete fortress._coolingStack;
      prepared.shutdown();
      active = false;
    },
  });
}
