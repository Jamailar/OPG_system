import { Body, Controller, Delete, Get, Header, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { AppleIapService } from './apple-iap.service';
import { IosAppAttestService } from '../auth/ios-app-attest.service';
import { AdminRoleGuard } from '../../common/guards/admin-role.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { tenantControllerPaths } from '../../common/utils/controller-paths';
import type { Response } from 'express';

@ApiTags('Payments')
@Controller(tenantControllerPaths('payments', true))
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly appleIapService: AppleIapService,
    private readonly iosAppAttestService: IosAppAttestService,
  ) {}

  @Get('products')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取可购买商品' })
  async listProducts(@Req() req: any, @Param('app') app?: string) {
    return this.paymentsService.listProducts(app || req.user.appSlug, req.user.id);
  }

  @Get('products/:product_id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取可购买商品详情' })
  async getProduct(
    @Req() req: any,
    @Param('app') app: string | undefined,
    @Param('product_id') productId: string,
  ) {
    return this.paymentsService.getProductForPurchase(app || req.user.appSlug, req.user.id, productId);
  }

  @Post('orders/page-pay')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建单次支付订单（支付宝）' })
  async createPagePayOrder(
    @Req() req: any,
    @Param('app') app: string | undefined,
    @Body() body: { product_id?: string; amount?: number | string; subject?: string; points_to_deduct?: number },
  ) {
    return this.paymentsService.createPagePayOrder(app || req.user.appSlug, req.user.id, body);
  }

  @Post('orders/wechat/native')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建微信 Native 支付订单' })
  async createWechatNativeOrder(
    @Req() req: any,
    @Param('app') app: string | undefined,
    @Body() body: { product_id?: string; amount?: number | string; description?: string },
  ) {
    return this.paymentsService.createWechatNativeOrder(app || req.user.appSlug, req.user.id, {
      ...body,
      client_ip: req.ip,
    });
  }

  @Post('orders/checkout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建支付订单（按租户启用的支付方式）' })
  async createCheckoutOrder(
    @Req() req: any,
    @Param('app') app: string | undefined,
    @Body()
    body: {
      provider_type?: string;
      payment_method_id?: string;
      product_id?: string;
      amount?: number | string;
      subject?: string;
      external_price_id?: string;
      external_variant_id?: string;
    },
  ) {
    return this.paymentsService.createCheckoutOrder(app || req.user.appSlug, req.user.id, body || {});
  }

  @Get('orders/:out_trade_no')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '查询订单状态' })
  async getOrderStatus(
    @Req() req: any,
    @Param('app') app: string | undefined,
    @Param('out_trade_no') outTradeNo: string,
  ) {
    return this.paymentsService.getOrderStatus(app || req.user.appSlug, req.user.id, outTradeNo);
  }

  @Post('apple/transactions/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '验证 Apple App Store 交易' })
  async verifyAppleTransaction(
    @Req() req: any,
    @Param('app') app: string | undefined,
    @Body() body: {
      transaction_id?: string;
      signed_transaction_info?: string;
      app_attest_key_id?: string;
      app_attest_assertion?: string;
      app_attest_challenge_id?: string;
    },
  ) {
    await this.iosAppAttestService.verifySensitiveIfRequired(app || req.user.appSlug, body || {}, req);
    return this.appleIapService.verifyTransaction(app || req.user.appSlug, req.user.id, body || {});
  }

  @Post('apple/restore')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '恢复 Apple App Store 购买' })
  async restoreApplePurchases(
    @Req() req: any,
    @Param('app') app: string | undefined,
    @Body() body: {
      original_transaction_id?: string;
      transaction_id?: string;
      app_attest_key_id?: string;
      app_attest_assertion?: string;
      app_attest_challenge_id?: string;
    },
  ) {
    await this.iosAppAttestService.verifySensitiveIfRequired(app || req.user.appSlug, body || {}, req);
    return this.appleIapService.restorePurchases(app || req.user.appSlug, req.user.id, body || {});
  }

  @Get('subscriptions/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的订阅权益' })
  async listMySubscriptions(@Req() req: any, @Param('app') app: string | undefined) {
    return this.appleIapService.listMySubscriptions(app || req.user.appSlug, req.user.id);
  }

  @Post('agreements/page-sign')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建周期签约（支付宝）' })
  async createAgreementSign(
    @Req() req: any,
    @Param('app') app: string | undefined,
    @Body() body: { product_id: string; execute_time?: string },
  ) {
    return this.paymentsService.createAgreementSign(app || req.user.appSlug, req.user.id, body);
  }

  @Get('agreements/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的签约列表' })
  async listMyAgreements(@Req() req: any, @Param('app') app: string | undefined) {
    return this.paymentsService.listMyAgreements(app || req.user.appSlug, req.user.id);
  }

  @Post('callbacks/trade-notify')
  @Public()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: '支付宝回调' })
  async tradeNotifyCallback(@Param('app') app: string | undefined, @Body() body: any) {
    const result = await this.paymentsService.processTradeNotify(app, body || {});
    return result.success ? 'success' : 'failure';
  }

  @Get('callbacks/trade-return')
  @Public()
  @ApiOperation({ summary: '支付宝页面回跳（中转）' })
  async tradeReturnCallback(@Param('app') app: string | undefined, @Query() query: any, @Res() res: Response) {
    const result = await this.paymentsService.processTradeReturn(app, query || {});
    if (result?.return_mode === 'redirect' && result?.redirect_url) {
      return res.redirect(302, result.redirect_url);
    }
    const outTradeNo = String(result?.out_trade_no || '');
    const orderStatus = String(result?.order_status || 'PENDING').toUpperCase();
    const tradeNo = String(result?.trade_no || '');
    const appName = String(result?.app_name || result?.app_slug || app || '应用');
    const isSuccess = orderStatus === 'PAID';
    const title = isSuccess ? '支付成功' : orderStatus === 'PENDING' ? '支付处理中' : '支付状态';
    const description = isSuccess
      ? '订单已支付完成，请返回应用查看权益或订单状态。'
      : '订单状态已更新，请返回应用查看最新结果。';
    const statusLabel = isSuccess ? '已支付' : orderStatus === 'PENDING' ? '处理中' : orderStatus;
    const html = this.buildTradeReturnHtml({
      appName,
      title,
      description,
      outTradeNo,
      tradeNo,
      statusLabel,
      isSuccess,
    });
    return res.status(200).type('text/html; charset=utf-8').send(html);
  }

  private buildTradeReturnHtml(input: {
    appName: string;
    title: string;
    description: string;
    outTradeNo: string;
    tradeNo: string;
    statusLabel: string;
    isSuccess: boolean;
  }) {
    const appName = this.escapeHtml(input.appName);
    const title = this.escapeHtml(input.title);
    const description = this.escapeHtml(input.description);
    const outTradeNo = this.escapeHtml(input.outTradeNo || '-');
    const tradeNo = this.escapeHtml(input.tradeNo || '-');
    const statusLabel = this.escapeHtml(input.statusLabel);
    const markClass = input.isSuccess ? 'success' : 'pending';
    const mark = input.isSuccess ? '✓' : '…';

    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title} - ${appName}</title>
  <style>
    :root{color-scheme:light}
    *{box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background:#f6f7f9;color:#111827;margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}
    .page{width:min(100%,420px);text-align:center}
    .brand{margin:0 0 18px;font-size:15px;font-weight:700;color:#374151;letter-spacing:0}
    .card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:28px 24px 22px;box-shadow:0 18px 44px rgba(17,24,39,.08)}
    .mark{width:56px;height:56px;margin:0 auto 18px;border-radius:999px;display:grid;place-items:center;font-size:34px;line-height:1}
    .mark.success{background:#ecfdf3;color:#16a34a}
    .mark.pending{background:#f3f4f6;color:#6b7280}
    h1{margin:0 0 10px;font-size:24px;line-height:1.2;color:#111827}
    p{margin:0;color:#4b5563;font-size:15px;line-height:1.7}
    .meta{margin:20px 0 0;padding:14px 0;border-top:1px solid #f0f2f5;border-bottom:1px solid #f0f2f5;text-align:left}
    .row{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:5px 0;font-size:13px;color:#6b7280}
    .row span:last-child{min-width:0;text-align:right;color:#374151;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .actions{display:flex;justify-content:center;margin-top:18px}
    .close{appearance:none;border:0;border-radius:10px;background:#111827;color:#fff;height:40px;padding:0 18px;font-size:14px;font-weight:600;cursor:pointer}
    .close:active{transform:translateY(1px)}
    .hint{margin-top:14px;font-size:13px;color:#6b7280}
    @media (max-width:480px){body{padding:18px}.card{border-radius:14px;padding:24px 20px 20px}.row{display:block}.row span:last-child{display:block;margin-top:3px;text-align:left}}
  </style>
</head>
<body>
  <main class="page">
    <p class="brand">${appName}</p>
    <section class="card" aria-label="支付结果">
      <div class="mark ${markClass}" aria-hidden="true">${mark}</div>
      <h1>${title}</h1>
      <p>${description}</p>
      <div class="meta">
        <div class="row"><span>订单号</span><span title="${outTradeNo}">${outTradeNo}</span></div>
        <div class="row"><span>交易号</span><span title="${tradeNo}">${tradeNo}</span></div>
        <div class="row"><span>状态</span><span>${statusLabel}</span></div>
      </div>
      <div class="actions"><button class="close" type="button" onclick="window.close()">关闭页面</button></div>
      <p class="hint"><span id="countdown">3</span> 秒后将尝试自动关闭，也可以手动关闭此页返回应用。</p>
    </section>
  </main>
  <script>
    (function(){
      var left = 3;
      var el = document.getElementById('countdown');
      var timer = setInterval(function(){
        left -= 1;
        if (el) el.textContent = String(Math.max(left, 0));
        if (left <= 0) {
          clearInterval(timer);
          window.close();
        }
      }, 1000);
    })();
  </script>
</body>
</html>`;
  }

  private escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (char) => {
      switch (char) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        default:
          return '&#39;';
      }
    });
  }

  @Post('callbacks/agreement-notify')
  @Public()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: '支付宝签约回调' })
  async agreementNotifyCallback(@Param('app') app: string | undefined, @Body() body: any) {
    const result = await this.paymentsService.processAgreementNotify(app, body || {});
    return result.success ? 'success' : 'failure';
  }

  @Post('callbacks/wechat-notify')
  @Public()
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @ApiOperation({ summary: '微信支付回调' })
  async wechatNotifyCallback(@Param('app') app: string | undefined, @Body() body: any) {
    const xmlPayload = typeof body === 'string' ? body : body?.xml || '';
    const result = await this.paymentsService.processWechatNotify(app, xmlPayload);
    return this.paymentsService.buildWechatNotifyAck(result.success, result.success ? 'OK' : result.message || 'FAIL');
  }

  @Post('callbacks/apple')
  @Public()
  @ApiOperation({ summary: 'Apple App Store Server Notifications 回调' })
  async appleNotifyCallback(@Param('app') app: string | undefined, @Body() body: any) {
    return this.appleIapService.processNotification(app, body || {});
  }

  @Post('callbacks/:provider/:method_id')
  @Public()
  @ApiOperation({ summary: 'SaaS 支付回调' })
  async saasNotifyCallback(
    @Req() req: any,
    @Param('app') app: string | undefined,
    @Param('provider') provider: string,
    @Param('method_id') methodId: string,
    @Body() body: any,
  ) {
    const result = await this.paymentsService.processSaasWebhook(
      app,
      provider,
      methodId,
      body || {},
      req.rawBody,
      req.headers || {},
    );
    return { success: result.success, message: result.message };
  }

  @Get('admin/products')
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员商品列表' })
  async adminListProducts(@Req() req: any, @Param('app') app: string | undefined) {
    return this.paymentsService.adminListProducts(app || req.user.appSlug, req.user.id);
  }

  @Post('admin/products')
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员创建商品' })
  async adminCreateProduct(@Req() req: any, @Param('app') app: string | undefined, @Body() body: any) {
    return this.paymentsService.adminCreateProduct(app || req.user.appSlug, req.user.id, body || {});
  }

  @Put('admin/products/:product_id')
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员更新商品' })
  async adminUpdateProduct(
    @Req() req: any,
    @Param('app') app: string | undefined,
    @Param('product_id') productId: string,
    @Body() body: any,
  ) {
    return this.paymentsService.adminUpdateProduct(app || req.user.appSlug, req.user.id, productId, body || {});
  }

  @Post('admin/products/:product_id/delete')
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员删除商品（兼容旧路径）' })
  async adminDeleteProductLegacy(@Req() req: any, @Param('app') app: string | undefined, @Param('product_id') productId: string) {
    return this.paymentsService.adminDeleteProduct(app || req.user.appSlug, req.user.id, productId);
  }

  @Post('admin/testing/one-time')
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员单次支付真实联调（支付宝）' })
  async adminRunOneTimeTest(@Req() req: any, @Param('app') app: string | undefined, @Body() body: any) {
    return this.paymentsService.adminRunOneTimeTest(app || req.user.appSlug, req.user.id, body || {});
  }

  @Post('admin/testing/recurring')
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员周期签约真实联调（支付宝）' })
  async adminRunRecurringTest(@Req() req: any, @Param('app') app: string | undefined, @Body() body: any) {
    return this.paymentsService.adminRunRecurringTest(app || req.user.appSlug, req.user.id, body || {});
  }

  @Post('admin/testing/full-flow')
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员支付全流程真实联调（支付宝）' })
  async adminRunFullFlowTest(@Req() req: any, @Param('app') app: string | undefined, @Body() body: any) {
    return this.paymentsService.adminRunFullFlowTest(app || req.user.appSlug, req.user.id, body || {});
  }

  @Post('admin/testing/wechat/one-time')
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员微信单次支付真实联调' })
  async adminRunWechatOneTimeTest(@Req() req: any, @Param('app') app: string | undefined, @Body() body: any) {
    return this.paymentsService.adminRunWechatOneTimeTest(app || req.user.appSlug, req.user.id, body || {});
  }

  @Get('admin/orders')
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员订单列表' })
  async adminListOrders(
    @Req() req: any,
    @Param('app') app: string | undefined,
    @Query('page') page?: number,
    @Query('page_size') pageSize?: number,
    @Query('status') status?: string,
  ) {
    return this.paymentsService.adminListOrders(app || req.user.appSlug, req.user.id, page || 1, pageSize || 20, status);
  }

  @Get('admin/dashboard-metrics')
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员首页关键数据统计' })
  async adminDashboardMetrics(
    @Req() req: any,
    @Param('app') app: string | undefined,
    @Query('range') range?: string,
  ) {
    return this.paymentsService.adminDashboardMetrics(app || req.user.appSlug, req.user.id, range);
  }

  @Post('admin/orders/:order_id/refund')
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员发起订单退款（支付宝）' })
  async adminRefundOrder(
    @Req() req: any,
    @Param('app') app: string | undefined,
    @Param('order_id') orderId: string,
    @Body() body: { amount?: string; reason?: string },
  ) {
    return this.paymentsService.adminRefundOrder(app || req.user.appSlug, req.user.id, orderId, body || {});
  }

  @Get('admin/agreements')
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员签约列表' })
  async adminListAgreements(
    @Req() req: any,
    @Param('app') app: string | undefined,
    @Query('page') page?: number,
    @Query('page_size') pageSize?: number,
    @Query('status') status?: string,
  ) {
    return this.paymentsService.adminListAgreements(
      app || req.user.appSlug,
      req.user.id,
      page || 1,
      pageSize || 20,
      status,
    );
  }

  @Get('admin/deductions')
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员扣款记录列表' })
  async adminListDeductions(
    @Req() req: any,
    @Param('app') app: string | undefined,
    @Query('page') page?: number,
    @Query('page_size') pageSize?: number,
  ) {
    return this.paymentsService.adminListDeductions(app || req.user.appSlug, req.user.id, page || 1, pageSize || 20);
  }

  @Post('admin/deductions/execute')
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员手动执行扣款' })
  async adminExecuteDeduction(@Req() req: any, @Param('app') app: string | undefined, @Body() body: any) {
    return this.paymentsService.adminExecuteDeduction(app || req.user.appSlug, req.user.id, body || {});
  }

  @Post('admin/deductions/trigger-auto-run')
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员触发自动扣款任务' })
  async adminTriggerAutoRun(
    @Req() req: any,
    @Param('app') app: string | undefined,
    @Query('batch_size') batchSize?: number,
  ) {
    return this.paymentsService.adminTriggerAutoRun(app || req.user.appSlug, req.user.id, batchSize || 50);
  }

  @Post('admin/agreements/:agreement_id/unsign')
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员解约' })
  async adminUnsignAgreement(
    @Req() req: any,
    @Param('app') app: string | undefined,
    @Param('agreement_id') agreementId: string,
  ) {
    return this.paymentsService.adminUnsignAgreement(app || req.user.appSlug, req.user.id, agreementId);
  }

  @Delete('admin/products/:product_id')
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员删除商品' })
  async adminDeleteProduct(@Req() req: any, @Param('app') app: string | undefined, @Param('product_id') productId: string) {
    return this.paymentsService.adminDeleteProduct(app || req.user.appSlug, req.user.id, productId);
  }
}
