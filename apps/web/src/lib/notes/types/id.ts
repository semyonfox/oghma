// extracted from Notea (MIT License)

// Note: This file requires nanoid to be installed
// Run: pnpm add nanoid
// Or implement custom ID generation

export const genFriendlyId = (): string => {
    // Custom alphabet excluding confusing characters
    const alphabet = '23456789abcdefghjkmnpqrstuvwxyz';
    const length = 4;
    let result = '';
    for (let i = 0; i < length; i++) {
        result += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return result;
};

export const genId = (): string => {
    // Generate a 10-character random ID
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
    const length = 10;
    let result = '';
    for (let i = 0; i < length; i++) {
        result += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return result;
};

// If you want to use nanoid instead, uncomment below and remove the implementations above:
// import { nanoid, customAlphabet } from 'nanoid';
// 
// export const genFriendlyId = customAlphabet(
//     '23456789abcdefghjkmnpqrstuvwxyz',
//     4
// );
// 
// export const genId = () => nanoid(10);
