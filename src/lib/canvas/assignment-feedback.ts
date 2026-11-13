import { z } from "zod";

export const assignmentFeedbackSchema = z.object({
  comments: z.array(z.object({
    author_name: z.string(),
    comment: z.string(),
    created_at: z.string().nullable(),
  })),
  rubric: z.array(z.object({
    id: z.string(),
    description: z.string(),
    points: z.number().nullable(),
    possible: z.number().nullable(),
    comment: z.string(),
  })).nullable(),
});

export type AssignmentFeedback = z.infer<typeof assignmentFeedbackSchema>;

const id = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]);
const timestamp = z.iso.datetime({ offset: true }).nullable().optional();
export const canvasFeedbackSubmissionSchema = z.object({
  assignment_id: id,
  user_id: id.optional(),
  graded_at: timestamp,
  submission_comments: z.array(z.object({
    author_id: id.optional(),
    author_name: z.string().nullish(),
    comment: z.string().nullish(),
    created_at: timestamp,
  })).nullish(),
  rubric_assessment: z.record(z.string(), z.object({
    points: z.number().nullish(),
    comments: z.string().nullish(),
  })).nullish(),
  assignment: z.object({
    rubric: z.array(z.object({
      id: z.string(),
      description: z.string().optional(),
      points: z.number().optional(),
    })).nullish(),
  }).nullish(),
});
export type CanvasFeedbackSubmission = z.infer<typeof canvasFeedbackSubmissionSchema>;
