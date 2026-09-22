import { browser } from '$app/environment';
import { base } from '$app/paths';
import { loadEconomy } from '$lib/civic/economy-repository';
export async function load({fetch,url}:{fetch:typeof globalThis.fetch;url:URL}){
  try{return {economy:await loadEconomy(fetch,base,browser?url.searchParams.get('release'):null),economyError:null};}
  catch{return {economy:null,economyError:'This economic snapshot could not load or failed validation. A pinned link never silently substitutes newer data.'};}
}
