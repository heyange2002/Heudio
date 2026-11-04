export const isAccessCode = value => typeof value === 'string' && /^[0-9]{4}$/.test(value);
