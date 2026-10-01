import type { InferResponseType } from "hono";

type authenticationError = {
  status: "fail";
  code: "401";
  message: "authentication required";
};

type CommentRes = {
  status: "success";
  code: "200";
  data: {
    comments: v1Comment[];
  };
};

export type CommentResponse = CommentRes | authenticationError;

export type Suggest = { title: string }[];

type SuggestRes = {
  status: "success";
  code: "200";
  data: Suggest;
};

export type SuggestResponse = SuggestRes | authenticationError;

export type SeriesListApiType =
  typeof import("@/lib/client").client.api.v4.series.$get;
export type SeriesListResponse = InferResponseType<SeriesListApiType>;
