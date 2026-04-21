export interface ArtboardModel {
  width: number;
  height: number;
  minX: number;
  minY: number;
  backgroundColor: string;
}

export const DEFAULT_ARTBOARD: Readonly<ArtboardModel> = {
  width: 800,
  height: 600,
  minX: 0,
  minY: 0,
  backgroundColor: '#ffffff'
};
