// extracted from Notea (MIT License)
// original: libs/shared/id.ts

import { customAlphabet } from 'nanoid';
import { v7 as uuidv7 } from 'uuid';

export const genFriendlyId = customAlphabet(
  '23456789abcdefghjkmnpqrstuvwxyz',
  4
);

// generate a UUID v7 (time-ordered, sortable) so IDs are compatible
// with the PostgreSQL UUID column type used throughout the DB schema
export const genId = () => uuidv7();
