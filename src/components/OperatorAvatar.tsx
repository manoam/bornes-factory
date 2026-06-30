import { memo, useState } from 'react'
import { getOperatorInitials, getOperatorColor } from '../utils/operatorAvatar'
import { useUsersDirectory } from '../hooks/useUsersDirectory'
import { cn } from './ui/cn'

/**
 * Affichage d'un opérateur (photo si dispo, sinon initiales colorées).
 *
 * Source des photos : annuaire local `users_ref` alimenté par RabbitMQ.
 * Si le name ne matche aucun user de l'annuaire, on tombe sur les
 * initiales. Si l'image part en 404 (URL fournie mais cassée côté
 * gateway), on bascule aussi en initiales — sans recharger le composant.
 */

interface OperatorAvatarProps {
  name?: string | null
  showName?: boolean
  size?: 'xs' | 'sm' | 'md'
  className?: string
  fallback?: string
}

const SIZE = {
  xs: { circle: 'h-4 w-4 text-[9px]', text: 'text-[11px]' },
  sm: { circle: 'h-5 w-5 text-[10px]', text: 'text-[12px]' },
  md: { circle: 'h-6 w-6 text-[11px]', text: 'text-sm' },
}

function OperatorAvatarImpl({
  name,
  showName = true,
  size = 'sm',
  className,
  fallback = '—',
}: OperatorAvatarProps) {
  const { pictureFor } = useUsersDirectory()
  const [imgFailed, setImgFailed] = useState(false)

  if (!name) {
    return <span className={cn('text-[--k-muted]', className)}>{fallback}</span>
  }

  const cls = SIZE[size]
  const pictureUrl = pictureFor(name)

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {pictureUrl && !imgFailed ? (
        <img
          src={pictureUrl}
          alt={name}
          title={name}
          onError={() => setImgFailed(true)}
          className={cn('shrink-0 rounded-full object-cover', cls.circle.split(' ')[0], cls.circle.split(' ')[1])}
        />
      ) : (
        <span
          className={cn(
            'flex shrink-0 items-center justify-center rounded-full font-semibold',
            cls.circle,
            getOperatorColor(name),
          )}
          title={name}
        >
          {getOperatorInitials(name)}
        </span>
      )}
      {showName && (
        <span className={cn('text-[--k-text] truncate', cls.text)}>{name}</span>
      )}
    </span>
  )
}

const OperatorAvatar = memo(OperatorAvatarImpl)
export default OperatorAvatar
