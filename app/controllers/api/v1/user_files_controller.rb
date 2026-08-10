module Api
  module V1
    class UserFilesController < BaseController
      before_action :set_user_file, only: :destroy

      def index
        user_files = UserFile.order(created_at: :desc)
        render json: user_files.map { |user_file| serialize(user_file) }
      end

      def create
        uploaded = params[:file]

        unless uploaded.respond_to?(:original_filename)
          return render json: { errors: [ "file is required" ] }, status: :unprocessable_entity
        end

        extension = File.extname(uploaded.original_filename).delete_prefix(".").downcase
        title = params[:title].presence || File.basename(uploaded.original_filename, ".*")

        user_file = UserFile.new(
          filename: uploaded.original_filename,
          title: title,
          file_type: extension
        )
        user_file.file.attach(uploaded)

        if user_file.save
          render json: serialize(user_file), status: :created
        else
          render json: { errors: user_file.errors.full_messages }, status: :unprocessable_entity
        end
      end

      def destroy
        @user_file.file.purge
        @user_file.destroy
        head :no_content
      end

      private

      def set_user_file
        @user_file = UserFile.find(params[:id])
      end

      def serialize(user_file)
        {
          id: user_file.id,
          public_id: user_file.public_id,
          title: user_file.title,
          filename: user_file.filename,
          file_type: user_file.file_type,
          created_at: user_file.created_at.iso8601,
          preview_url: preview_path(user_file.public_id)
        }
      end
    end
  end
end
