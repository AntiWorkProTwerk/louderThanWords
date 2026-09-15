<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { getAuth, accountRequest } from '$lib/account/client';
  let loading = $state(true),
    configured = $state(false),
    email = $state(''),
    signedIn = $state(''),
    message = $state(''),
    busy = $state(false),
    subscription = $state('free'),
    billing = $state(false);
  onMount(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const auth = await getAuth();
        if (disposed) return;
        configured = !!auth;
        if (auth) {
          const { data } = await auth.auth.getSession();
          signedIn = data.session?.user.email ?? '';
          const listener = auth.auth.onAuthStateChange((_event, session) => {
            signedIn = session?.user.email ?? '';
          });
          unsubscribe = () => listener.data.subscription.unsubscribe();
          if (data.session) {
            const result = await accountRequest('account');
            if (!disposed) {
              subscription = result.subscription;
              billing = result.billingConfigured;
            }
          }
        }
      } catch (error) {
        message = (error as Error).message;
      } finally {
        if (!disposed) loading = false;
      }
    })();
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  });
  async function signIn(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    message = '';
    try {
      const auth = await getAuth();
      if (!auth) throw new Error('Accounts are not connected in this demo.');
      const { error } = await auth.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${location.origin}${base}/?panel=account` },
      });
      if (error) throw error;
      message = 'Check your email for a secure sign-in link.';
    } catch (error) {
      message = (error as Error).message;
    } finally {
      busy = false;
    }
  }
  async function signOut() {
    try {
      const auth = await getAuth();
      const result = await auth?.auth.signOut();
      if (result?.error) throw result.error;
      signedIn = '';
      subscription = 'free';
      message = 'You are signed out.';
    } catch (error) {
      message = (error as Error).message;
    }
  }
  async function openBilling(path: string) {
    busy = true;
    try {
      const result = await accountRequest(`billing/${path}`, { method: 'POST', body: '{}' });
      const destination = new URL(result.url);
      if (
        destination.protocol !== 'https:' ||
        !['checkout.stripe.com', 'billing.stripe.com'].includes(destination.hostname)
      )
        throw new Error('Invalid billing destination.');
      location.assign(destination.href);
    } catch (error) {
      message = (error as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

{#if loading}<p role="status">Loading account settings…</p>
{:else if !configured}<div class="account-demo">
    <p class="eyebrow">Explore freely</p>
    <h3>Your voice belongs here.</h3>
    <p>
      The public explorer is ready to use. You can save representatives and private notes on this
      device.
    </p>
    <p>Online accounts and subscriptions are not connected in this demo.</p>
  </div>
{:else if signedIn}<p>Signed in as <strong>{signedIn}</strong></p>
  <div class="account-plan">
    <span>Your plan</span><strong
      >{subscription === 'active' || subscription === 'trialing'
        ? 'Supporter'
        : 'Free explorer'}</strong
    >
  </div>
  <p>
    Supporters can access subscriber analysis. Your saved representatives and notes stay private.
  </p>
  {#if billing}<button
      class="primary-button"
      disabled={busy}
      onclick={() =>
        openBilling(
          subscription === 'active' || subscription === 'trialing' ? 'portal' : 'checkout',
        )}
      >{busy
        ? 'Opening…'
        : subscription === 'active' || subscription === 'trialing'
          ? 'Manage subscription'
          : 'Become a supporter'}</button
    >{:else}<p>Subscriptions are not available yet.</p>{/if}<button
    class="secondary-button"
    onclick={signOut}>Sign out</button
  >
{:else}<p>Save representatives and notes across devices. We’ll email you a secure sign-in link.</p>
  <form onsubmit={signIn}>
    <label class="field-label" for="account-email">Email address</label><input
      id="account-email"
      type="email"
      autocomplete="email"
      required
      bind:value={email}
      placeholder="you@example.com"
    /><button class="primary-button" disabled={busy}
      >{busy ? 'Sending…' : 'Email me a sign-in link'}</button
    >
  </form>{/if}
{#if message}<p class="feedback-message" role="status">{message}</p>{/if}
