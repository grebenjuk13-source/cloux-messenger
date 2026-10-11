import {AsYouType, getCountries, getCountryCallingCode, isValidPhoneNumber, parsePhoneNumberFromString, type CountryCode} from 'libphonenumber-js';
// Country names and calling codes come from international metadata, not a hardcoded 3-country list.
const names=new Intl.DisplayNames(['uk'],{type:'region'});
export const countries=getCountries().map(code=>({code,name:names.of(code)||code,dial:'+'+getCountryCallingCode(code)})).sort((a,b)=>a.name.localeCompare(b.name,'uk'));
export type Country=typeof countries[number];
export const UA=countries.find(c=>c.code==='UA')!;
export function flag(c:string){return c.toUpperCase().replace(/./g,x=>String.fromCodePoint(127397+x.charCodeAt(0)));}
export function formatPhone(input:string,country:Country){const raw=input.replace(/[^\d]/g,'');return new AsYouType(country.code as CountryCode).input(raw)}
export function normalizePhone(input:string,country:Country){const parsed=parsePhoneNumberFromString(input,country.code as CountryCode);return parsed?.isValid()?parsed.number:null}
export function validPhone(input:string,country:Country){return isValidPhoneNumber(input,country.code as CountryCode)}