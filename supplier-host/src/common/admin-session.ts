// UI gate only; the supplier must enforce hardware permissions in Rust as well.
let authorized=false;
export function grantAdminSession(){authorized=true;}
export function hasAdminSession(){return authorized;}
export function clearAdminSession(){authorized=false;}
