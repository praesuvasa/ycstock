-- v1.27 · เคสใหม่: ลูกค้าโอนแล้วไม่เอาเลย → void ทั้งบิล คืนเงินสดเต็มจำนวน (แพรแจ้ง 2026-07-30)
alter table sales_payment_incidents drop constraint if exists sales_payment_incidents_kind_check;
alter table sales_payment_incidents add constraint sales_payment_incidents_kind_check
  check (kind in ('over_no_change','over_cash_change','under_cash_topup','menu_change_refund','void_full_refund'));
