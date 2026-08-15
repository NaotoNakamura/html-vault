# Be sure to restart your server when you modify this file.

# Define an application-wide content security policy.
# See the Securing Rails Applications Guide for more information:
# https://guides.rubyonrails.org/security.html#content-security-policy-header
#
# PreviewController が /preview/*filename 用に独自の `sandbox` CSP を
# response.set_header で直接セットしているため、ここでの設定とは競合しない
# (ActionDispatch::ContentSecurityPolicy::Middleware は既にヘッダーが
# セットされているレスポンスをスキップする)。ここで定義するのは
# AdminController (管理画面SPA) 向けのポリシー。

Rails.application.configure do
  config.content_security_policy do |policy|
    policy.default_src :self
    policy.img_src     :self, :data
    policy.font_src    :self, :data
    policy.object_src  :none
    policy.base_uri    :none
    policy.frame_ancestors :none

    if Rails.env.development?
      # Vite dev server (:5173) が別オリジンからモジュール配信・HMRを行い、
      # Fast Refresh preamble をインラインscriptとして注入しているため
      # (docs/frontend-architecture.md 参照)
      policy.script_src  :self, :unsafe_inline, "http://localhost:5173"
      policy.style_src   :self, :unsafe_inline, "http://localhost:5173"
      policy.connect_src :self, "http://localhost:5173", "ws://localhost:5173"
    else
      policy.script_src  :self
      policy.style_src   :self
      policy.connect_src :self
    end
  end

  # Report violations without enforcing the policy.
  # config.content_security_policy_report_only = true
end
