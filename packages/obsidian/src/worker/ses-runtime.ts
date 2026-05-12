/* global Compartment, harden, lockdown -- Somehow eslint does not know the globals created by the ses import exist. */

import 'ses';
import type { Harden } from 'ses';

lockdown();

export const sesHarden: Harden = harden;
export const SesCompartment = Compartment;
