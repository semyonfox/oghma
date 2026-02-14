// extracted from Notea (MIT License)
// original: libs/shared/id.ts

import { nanoid, customAlphabet } from 'nanoid';

export const genFriendlyId = customAlphabet(
  '23456789abcdefghjkmnpqrstuvwxyz',
  4
);

export const genId = () => nanoid(10);
