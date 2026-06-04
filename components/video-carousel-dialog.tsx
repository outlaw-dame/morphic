'use client'

import { useEffect, useRef, useState } from 'react'

import { SerperSearchResultItem } from '@/lib/types'
import { getVideoPlaybackSource } from '@/lib/video/embed'

import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious
} from '@/components/ui/carousel'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'

function getPostMessageOrigin(frame: HTMLIFrameElement) {
  try {
    return new URL(frame.src, window.location.href).origin
  } catch {
    return '*'
  }
}

interface VideoCarouselDialogProps {
  children: React.ReactNode
  videos: SerperSearchResultItem[]
  query: string
  initialIndex?: number // Add initialIndex prop
}

export function VideoCarouselDialog({
  children,
  videos,
  query,
  initialIndex = 0 // Default to 0
}: VideoCarouselDialogProps) {
  const [api, setApi] = useState<CarouselApi>()
  const [current, setCurrent] = useState(initialIndex + 1)
  const videoRefs = useRef<(HTMLIFrameElement | null)[]>([])
  const previousIndexRef = useRef(initialIndex)

  useEffect(() => {
    if (!api) {
      return
    }

    const handleSelect = () => {
      const newIndex = api.selectedScrollSnap()
      const prevVideo = videoRefs.current[previousIndexRef.current]
      prevVideo?.contentWindow?.postMessage(
        '{"event":"command","func":"pauseVideo","args":""}',
        prevVideo ? getPostMessageOrigin(prevVideo) : '*'
      )
      previousIndexRef.current = newIndex
      setCurrent(newIndex + 1)
    }

    api.on('select', handleSelect)

    return () => {
      api.off('select', handleSelect)
    }
  }, [api])

  // Scroll to the initial index when the dialog opens and API is ready
  useEffect(() => {
    if (api) {
      previousIndexRef.current = initialIndex
      api.scrollTo(initialIndex, false) // Scroll instantly
    }
  }, [api, initialIndex])

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Search Videos</DialogTitle>
          <DialogDescription className="text-sm">{query}</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Carousel
            setApi={nextApi => {
              previousIndexRef.current = initialIndex
              setCurrent((nextApi?.selectedScrollSnap() ?? initialIndex) + 1)
              setApi(nextApi)
            }}
            className="w-full bg-muted max-h-[60vh]"
            opts={{
              startIndex: initialIndex // Set initial slide
            }}
          >
            <CarouselContent>
              {videos.map((video, idx) => {
                const playbackSource = getVideoPlaybackSource(
                  video,
                  typeof window === 'undefined'
                    ? undefined
                    : window.location.hostname
                )
                return (
                  <CarouselItem key={idx}>
                    <div className="p-1 flex items-center justify-center h-full">
                      {playbackSource.kind === 'iframe' ? (
                        <iframe
                          ref={el => {
                            videoRefs.current[idx] = el
                          }}
                          src={playbackSource.src}
                          className="w-full aspect-video"
                          title={video.title}
                          allow="autoplay; encrypted-media; fullscreen; picture-in-picture; web-share"
                          allowFullScreen
                          loading="lazy"
                          referrerPolicy="strict-origin-when-cross-origin"
                          sandbox={
                            playbackSource.isolation === 'sandboxed'
                              ? 'allow-scripts allow-popups allow-popups-to-escape-sandbox'
                              : undefined
                          }
                        />
                      ) : playbackSource.kind === 'video' ? (
                        <video
                          src={playbackSource.src}
                          className="w-full aspect-video bg-black"
                          controls
                          playsInline
                        />
                      ) : (
                        <a
                          href={playbackSource.src}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex aspect-video w-full items-center justify-center bg-background text-sm text-primary hover:underline"
                        >
                          Open video
                        </a>
                      )}
                    </div>
                  </CarouselItem>
                )
              })}
            </CarouselContent>
            <div className="absolute inset-8 flex items-center justify-between p-4 pointer-events-none">
              <CarouselPrevious className="w-10 h-10 rounded-full shadow-sm focus:outline-hidden pointer-events-auto">
                <span className="sr-only">Previous</span>
              </CarouselPrevious>
              <CarouselNext className="w-10 h-10 rounded-full shadow-sm focus:outline-hidden pointer-events-auto">
                <span className="sr-only">Next</span>
              </CarouselNext>
            </div>
          </Carousel>
          <div className="py-2">
            <div className="text-center text-sm text-muted-foreground">
              {current} of {videos.length}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
