import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

/**
 * Annuaire local des utilisateurs Konitys.
 *
 * Source : table `users_ref` côté Factory, alimentée par les events RabbitMQ
 * `*.users.*`. On la fetch une fois et on cache 5 min — c'est assez fréquent
 * pour rafraîchir les photos quand un user change la sienne, mais pas trop
 * pour spam-fetch à chaque montage de composant.
 *
 * `pictureFor(name)` essaie de matcher un nom complet (style "Sébastien Mahé"
 * tel que stocké dans `assembly_orders.operatorName`) contre la concatenation
 * `prenom + nom` de la table. Si match → on construit l'URL `photo_url` brute
 * fournie par l'app source, ou on calque sur le gateway si on n'a que
 * `photo_nom`.
 */

interface UserRefRow {
  id: number;
  email: string | null;
  nom: string | null;
  prenom: string | null;
  username: string | null;
  photo_nom: string | null;
  photo_url: string | null;
}

function fullNameOf(u: UserRefRow): string {
  return [u.prenom, u.nom].filter(Boolean).join(' ').trim();
}

function pictureUrlFor(u: UserRefRow): string | null {
  // L'app source publie soit une URL complète (photo_url), soit un nom de
  // fichier (photo_nom) à coller derrière la gateway. On préfère
  // photo_url si présente.
  if (u.photo_url) return u.photo_url;
  if (!u.photo_nom) return null;
  const gateway = import.meta.env.VITE_PLATEFORM_URL;
  if (!gateway) return null;
  return `${gateway}/uploads/contacts/${u.photo_nom}`;
}

export function useUsersDirectory() {
  const { data } = useQuery({
    queryKey: ['users-ref'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: UserRefRow[] }>(
        '/users-ref?limit=500',
      );
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });

  const indexByFullName = useMemo(() => {
    const map = new Map<string, UserRefRow>();
    for (const u of data || []) {
      const full = fullNameOf(u).toLowerCase();
      if (full) map.set(full, u);
    }
    return map;
  }, [data]);

  return {
    users: data || [],
    /** Retourne l'URL de la photo correspondant à un nom complet, sinon null. */
    pictureFor(name: string | null | undefined): string | null {
      if (!name) return null;
      const u = indexByFullName.get(name.trim().toLowerCase());
      return u ? pictureUrlFor(u) : null;
    },
    /** Cherche un user par nom complet (case-insensitive). */
    findByName(name: string | null | undefined): UserRefRow | null {
      if (!name) return null;
      return indexByFullName.get(name.trim().toLowerCase()) || null;
    },
  };
}
