import assert from 'node:assert/strict';
import test from 'node:test';
import { tidyTitle } from '../src/server/prim.js';
import { incidentUntil } from '../src/client/incident-until.js';

test('traffic titles drop the line prefix and use a dash between stations', () => {
  // Real IDFM titles, November 2026.
  assert.equal(
    tidyTitle('Ligne U: La Déf. <->La Verrière 02/11-04/12 en semaine de soirée'),
    'La Déf. – La Verrière 02/11-04/12 en semaine de soirée',
  );
  assert.equal(
    tidyTitle('RER A : Maisons-Laffitte - Cergy le Haut du 16 au 27/11'),
    'Maisons-Laffitte – Cergy le Haut du 16 au 27/11',
  );
  assert.equal(
    tidyTitle('Métro 13 : Travaux de modernisation - Trafic interrompu'),
    'Travaux de modernisation – Trafic interrompu',
  );
  assert.equal(
    tidyTitle('Ligne L : Sartrouville <> Maisons-Laffitte du 07 au 11/12'),
    'Sartrouville – Maisons-Laffitte du 07 au 11/12',
  );
  assert.equal(tidyTitle('Trafic perturbé'), 'Trafic perturbé');
  assert.equal(tidyTitle('Ligne U :'), 'Ligne U :');
});

test('traffic end labels use Paris days and stay short', () => {
  const now = new Date('2026-11-18T21:30:00Z'); // 22:30 in Paris
  assert.equal(incidentUntil('2026-11-18T22:00:00.000Z', now), 'Jusqu’à 23:00');
  // 00:30 UTC is already the 19th in Paris.
  assert.equal(incidentUntil('2026-11-19T01:13:00.000Z', now), 'Jusqu’à demain 02:13');
  assert.equal(incidentUntil('2026-11-27T02:00:00.000Z', now), 'Jusqu’au ven. 27 nov., 03:00');
  assert.equal(incidentUntil('2099-12-31T22:59:00.000Z', now), 'Jusqu’à nouvel ordre');
  assert.equal(incidentUntil(undefined, now), 'En cours');
  assert.equal(incidentUntil('n/a', now), 'En cours');
});
