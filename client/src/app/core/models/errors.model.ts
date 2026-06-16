
export class ListFullError extends Error {
    constructor() {

        super('LIST_FULL');
        this.name = 'ListFullError';
    }
}
