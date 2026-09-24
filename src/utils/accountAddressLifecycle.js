const EMPTY_ADDRESSES = []

export function getAuthenticatedAddressOwner({ isAuthLoaded, isUserLoaded, isSignedIn, clerkSubject, canonicalSubject, canonicalUserId }) {
  if (!isAuthLoaded || !isUserLoaded || !isSignedIn || !clerkSubject || canonicalSubject !== clerkSubject) return null
  return canonicalUserId || null
}

export function getVisibleSavedAddresses(ownerId, loadedOwnerId, addresses) {
  return ownerId && ownerId === loadedOwnerId ? addresses : EMPTY_ADDRESSES
}
