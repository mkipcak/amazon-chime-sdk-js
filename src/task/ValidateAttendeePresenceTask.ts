// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import AudioVideoControllerState from '../audiovideocontroller/AudioVideoControllerState';
import MeetingSessionStatusCode from '../meetingsession/MeetingSessionStatusCode';
import TimeoutScheduler from '../scheduler/TimeoutScheduler';
import BaseTask from './BaseTask';

/*
 * [[ValidateAttendeePresenceTask]] waits until an attendee presence event happens.
 */
export default class ValidateAttendeePresenceTask extends BaseTask {
  protected taskName = 'ValidateAttendeePresenceTask';

  static readonly TIMEOUT_MS: number = 5000;

  private cancelPromise: (error: Error) => void;

  constructor(
    private context: AudioVideoControllerState,
    private timeoutMs: number = ValidateAttendeePresenceTask.TIMEOUT_MS
  ) {
    super(context.logger);
  }

  cancel(): void {
    const error = new Error(`canceling ${this.name()}`);
    this.cancelPromise && this.cancelPromise(error);
  }

  async run(): Promise<void> {
    const attendeeId = this.context.meetingSessionConfiguration.credentials.attendeeId;
    if (this.context.realtimeController.realtimeExternalUserIdFromAttendeeId(attendeeId)) {
      return;
    }

    const scheduler = new TimeoutScheduler(this.timeoutMs);
    await new Promise<void>((resolve, reject) => {
      const handler = (
        presentAttendeeId: string,
        present: boolean,
        _externalUserId: string,
        _dropped: boolean
      ): void => {
        if (attendeeId === presentAttendeeId && present) {
          this.context.realtimeController.realtimeUnsubscribeToAttendeeIdPresence(handler);
          scheduler.stop();
          resolve();
        }
      };

      this.cancelPromise = (error: Error) => {
        this.context.realtimeController.realtimeUnsubscribeToAttendeeIdPresence(handler);
        scheduler.stop();
        reject(error);
      };

      this.context.realtimeController.realtimeSubscribeToAttendeeIdPresence(handler);
      scheduler.start(() => {
        const error = new Error(
          `canceling ${this.name()} due to the meeting status code: ${
            MeetingSessionStatusCode.NoAttendeePresent
          }`
        );
        this.cancelPromise && this.cancelPromise(error);
      });
    });
  }
}
