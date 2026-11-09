# Deployment

Production deployments go through a [GitLab](../tools/gitlab.md) pipeline, after a code review
by a second person.

Never on Friday after 3 p.m., except an urgent fix approved by Claire Martin: see the
[decision of October 2026](../decisions/2026-10-no-friday-deployments.md).

1. Merge the merge request into `main`.
2. Wait for the pipeline to pass, then click **Deploy to production**.
3. Announce it in `#changes`, with a link to the pipeline.
