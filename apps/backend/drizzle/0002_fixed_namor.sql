ALTER TABLE "allocations" DROP CONSTRAINT "allocations_amount_check";--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_amount_check" CHECK ("allocations"."amount" >= 0);