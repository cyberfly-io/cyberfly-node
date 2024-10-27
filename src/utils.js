export function isFlatJson(obj) {
    // Check if the input is an object and not null
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }

    // Iterate over the object's keys
    for (const key in obj) {
        // Check if the key belongs to the object and is not inherited
        if (obj.hasOwnProperty(key)) {
            // Check if the value is an object or an array
            if (typeof obj[key] === 'object' && obj[key] !== null) {
                return false; // Found a nested object or array
            }
        }
    }
    
    return true; // No nested objects or arrays found
}