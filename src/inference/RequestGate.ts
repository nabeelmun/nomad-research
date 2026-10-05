export class RequestGate {
  private active: { id: number; cancelled: boolean } | null = null;
  private sequence = 0;
  begin(): number {
    if (this.active) throw new Error('A request is still running.');
    const id = ++this.sequence;
    this.active = { id, cancelled: false };
    return id;
  }
  cancel(): void {
    if (this.active) this.active.cancelled = true;
  }
  isCurrent(id: number): boolean {
    return this.active?.id === id;
  }
  isCancelled(id: number): boolean {
    return this.active?.id !== id || this.active.cancelled;
  }
  finish(id: number): boolean {
    if (!this.isCurrent(id)) return false;
    this.active = null;
    return true;
  }
  busy(): boolean {
    return this.active !== null;
  }
}
