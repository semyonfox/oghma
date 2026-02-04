# Core Package

This package acts as a shared "dictionary" for other parts of the Socsboard project. It defines a common language and
set of rules that the [**Frontend**](../../GLOSSARY.md#frontend) and [**Backend Adapters
**](../../GLOSSARY.md#backend-adapter) use to communicate.

For definitions of technical terms, please see the main project [**Glossary**](../../GLOSSARY.md).

## Purpose

The main goal of this package is to ensure consistency. It makes sure that when different parts of the application talk
about a "User" or a "Board", they are all talking about the same thing. This prevents miscommunication and bugs.

It defines a contract, or a set of required functions, that any backend service must provide. This is key to our
flexible design ([**Adapter Pattern**](../../GLOSSARY.md#adapter-pattern)) that lets us switch between services like
Firebase and AWS.

## Example: Backend Contract

Below is an example of the contract that every backend adapter must follow. It's written in JavaScript with comments (
JSDoc) that explain what each part does.

```javascript
// src/interfaces/IBackend.js
/**
 * @typedef {Object} Board - A board object.
 * @property {string} id - The board's unique identifier.
 * // Add other properties of Board here if known
 */

/**
 * @interface IBackend
 * Defines the methods that any backend adapter must implement.
 */
class IBackend {
    /**
     * Retrieves a board by its ID.
     * @param {string} id - The ID of the board to retrieve.
     * @returns {Promise<Board>} A promise that resolves with the board object.
     */
    async getBoard(id) {
        throw new Error("Method 'getBoard()' must be implemented.");
    }

    /**
     * Creates a new board.
     * @param {Board} board - The board object to create.
     * @returns {Promise<void>} A promise that resolves when the board is created.
     */
    async createBoard(board) {
        throw new Error("Method 'createBoard()' must be implemented.");
    }
}
```

