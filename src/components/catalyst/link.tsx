import * as Headless from '@headlessui/react'
import NextLink, { type LinkProps } from 'next/link'
import type { ComponentProps } from 'react'

export function Link(props: LinkProps & ComponentProps<'a'>) {
  return (
    <Headless.DataInteractive>
      <NextLink {...props} />
    </Headless.DataInteractive>
  )
}
