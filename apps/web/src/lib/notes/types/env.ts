// extracted from Notea (MIT License)
// adapted for socsboard - removed Notea-specific environment variables

export function parseBool(str: string, invalid?: boolean): boolean;
export function parseBool(str: null | undefined): undefined;
export function parseBool(str: string | null | undefined, invalid: boolean): boolean;
export function parseBool(str: string | null | undefined, invalid?: boolean): boolean | undefined;
export function parseBool(str: string | null | undefined, invalid?: boolean): boolean | undefined {
    if (str == null) {
        return invalid ?? undefined;
    }
    switch (str.toLowerCase()) {
        case "true":
        case "1":
        case "yes":
        case "on":
            return true;
        case "false":
        case "0":
        case "no":
        case "off":
            return false;
        default:
            if (invalid == null) throw new Error("Invalid boolean: " + str);
            else return invalid;
    }
}
