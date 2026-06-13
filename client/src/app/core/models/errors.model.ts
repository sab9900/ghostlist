/** Thrown when a list has reached its maximum number of members (server returns 409). */
export class ListFullError extends Error {
    constructor() {
        super('LIST_FULL');
        this.name = 'ListFullError';
    }
}
