// GT7 car names by car code: the telemetry sends only the code.
// Data: packages/telemetry/data/SOURCE.md (gt7info, MIT No Attribution, vendored, offline).

import carFile from '../data/cars.json' with { type: 'json' };

const cars = carFile.cars as Record<string, string[]>;

/**
 * The car's name as GT7 shows it ("Jaguar F-type Gr.3", "Enzo Ferrari '02"); undefined for a car newer than
 * the bundled list. The maker goes in front unless the model already names it.
 */
export function carName(code: number): string | undefined {
  const car = cars[String(code)];
  if (!car) return undefined;
  const [maker = '', model = ''] = car;
  const named = new RegExp(`(^|[^\\p{L}])${maker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'iu').test(model);
  return named ? model : `${maker} ${model}`;
}
