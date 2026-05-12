/* global Compartment, harden, lockdown */

import 'ses';
import type { Harden } from 'ses';

lockdown();

export const sesHarden: Harden = harden;
export const SesCompartment = Compartment;
