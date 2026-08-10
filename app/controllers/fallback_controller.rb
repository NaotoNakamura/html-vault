class FallbackController < ActionController::Base
  layout false

  def index
    render :index
  end
end
