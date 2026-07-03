'use client'

import Link from 'next/link'

import { DropdownMenuItem } from '@/components/ui/dropdown-menu'

import { NativeIcon } from '@/components/native/native-icon'

const externalLinks = [
  {
    name: 'GitHub',
    href: 'https://github.com/outlaw-dame/morphic'
  }
]

export function ExternalLinkItems() {
  return (
    <>
      {externalLinks.map(link => (
        <DropdownMenuItem key={link.name} asChild>
          <Link href={link.href} target="_blank" rel="noopener noreferrer">
            <NativeIcon name="externalLink" className="size-4" />
            <span>{link.name}</span>
          </Link>
        </DropdownMenuItem>
      ))}
    </>
  )
}
