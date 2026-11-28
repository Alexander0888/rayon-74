import { rackCells } from '../carrot/layout.js';
import { cartRacks } from '../departmentLayout.js';

export const pearTypes = ['abate', 'decana', 'kaiser', 'conference', 'fred', 'nashi', 'swiss', 'louise'];
export const pearIds = pearTypes.map((type) => 'pear-' + type);
export const pearVisibleColumns = 4;
const columns = cartRacks[1].columns;
export const pearSlots = rackCells(columns).filter((_, index) => index % columns < pearVisibleColumns);
