/*
Copyright 2023 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { TileDescriptor } from '../video-grid/VideoGrid'
import { FakeItemData } from '../video-grid/FakeVideoTile'
import { useCallback, useState } from 'react'
import { useLatest } from '../useLatest'
import { generateRandomName } from '../auth/generateRandomName'

interface FakeTiles {
  fakeTiles: TileDescriptor<FakeItemData>[]
  simulateJoin: () => void
}

export const useFakeTiles = (): FakeTiles => {
  const [tiles, setTiles] = useState<TileDescriptor<FakeItemData>[]>([])
  const latestSetTiles = useLatest(setTiles)

  const simulateJoin = useCallback(() => {
    const name = generateRandomName()
    const newTile: TileDescriptor<FakeItemData> = {
      id: name,
      focused: false,
      isPresenter: false,
      isSpeaker: false,
      hasVideo: false,
      local: false,
      largeBaseSize: false,
      data: {
        type: "fake",
        name,
        screenshare: false,
        speaking: false,
        simulateScreenshare: () => latestSetTiles.current(ts => {
          if (ts.some(t => t.data.name === newTile.id && t.data.screenshare)) {
            // No-op since they're already screensharing
            return ts
          } else {
            const newScreenshareTile: TileDescriptor<FakeItemData> = {
              id: `${name}:screenshare`,
              focused: false,
              isPresenter: false,
              isSpeaker: false,
              hasVideo: true,
              local: false,
              largeBaseSize: true,
              placeNear: newTile.id,
              data: {
                type: "fake",
                name,
                screenshare: true,
                speaking: false,
                remove: () => latestSetTiles.current(ts => ts.filter(t => t.id !== newScreenshareTile.id))
              }
            }
            return [...ts, newScreenshareTile]
          }
        }),
        simulateSpeaking: () => latestSetTiles.current(ts => ts.map(t => {
          if (t.id === newTile.id) {
            return {
              ...t,
              isSpeaker: !t.isSpeaker,
              data: {
                ...t.data,
                speaking: !t.isSpeaker,
              }
            }
          } else {
            return t
          }
        })),
        remove: () => latestSetTiles.current(ts => ts.filter(t => t.id !== newTile.id))
      }
    }
    setTiles(ts => [...ts, newTile])
  }, [setTiles, latestSetTiles])

  return {
    fakeTiles: tiles,
    simulateJoin,
  }
}
